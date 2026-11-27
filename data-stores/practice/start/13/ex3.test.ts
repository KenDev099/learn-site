import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { exportMonth } from './export.ts'

describe('練習 3：匯出 Parquet（依門市分區）', { timeout: 30_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'learn-ds13-'))
  let n = 0
  const newDir = () => mkdtempSync(join(root, `out${n++}-`))
  let instance: DuckDBInstance
  let duck: DuckDBConnection
  const rows = async (sql: string) => (await duck.runAndReadAll(sql)).getRowObjectsJson()

  before(async () => {
    instance = await DuckDBInstance.create(':memory:')
    duck = await instance.connect()
    // 2026-02-20 起每 113 秒一筆，到 4 月中；門市 11～15。另外加上月界的訂單，以及只在 4 月營業的門市 17
    await duck.run(`CREATE TABLE orders AS
      SELECT 20000 + g AS id, CAST(11 + g % 5 AS INTEGER) AS store_id, CAST(101 + g % 300 AS INTEGER) AS customer_id,
             TIMESTAMP '2026-02-20 00:00:00' + to_seconds(g * 113) AS ordered_at,
             CAST(70 + (g % 97) * 1.7 AS DECIMAL(10,1)) AS total
      FROM range(0, 40000) t(g)`)
    await duck.run(`INSERT INTO orders VALUES
      (11, 12, 101, TIMESTAMP '2026-02-28 23:59:59.999', 80.0),
      (12, 12, 102, TIMESTAMP '2026-03-01 00:00:00', 110.0),
      (13, 13, 103, TIMESTAMP '2026-03-31 23:59:59.999', 96.8),
      (14, 13, 104, TIMESTAMP '2026-04-01 00:00:00', 120.0),
      (15, 17, 105, TIMESTAMP '2026-04-02 09:00:00', 70.0)`)
  })
  after(() => {
    duck?.closeSync()
    instance?.closeSync()
    rmSync(root, { recursive: true, force: true })
  })

  async function check(month: string, from: string, to: string) {
    const dir = newDir()
    const files = await exportMonth(duck, month, dir)
    const actual = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith('.parquet')).sort()
    assert.ok(actual.length > 0, `${dir} 底下沒有 .parquet 檔案：COPY … TO 要用 FORMAT parquet`)
    assert.deepEqual(files, actual, `回傳值要是資料夾裡所有 .parquet 檔案的相對路徑（排序過），實際資料夾裡有 ${JSON.stringify(actual)}`)
    for (const f of actual) {
      assert.match(f, /^store_id=\d+\/[^/]+\.parquet$/, `${f} 不是 store_id=<門市>/檔名.parquet：COPY 要加 PARTITION_BY (store_id)`)
      assert.equal(readFileSync(join(dir, f)).subarray(0, 4).toString(), 'PAR1', `${f} 不是 Parquet 檔（Parquet 檔開頭是 PAR1）：用 FORMAT parquet`)
    }
    const want = (await rows(`SELECT count(*) AS n, CAST(sum(total) AS VARCHAR) AS s, list_sort(list(DISTINCT store_id)) AS stores
      FROM orders WHERE ordered_at >= TIMESTAMP '${from}' AND ordered_at < TIMESTAMP '${to}'`))[0]
    const got = (await rows(`SELECT count(*) AS n, CAST(sum(total) AS VARCHAR) AS s, list_sort(list(DISTINCT CAST(store_id AS INTEGER))) AS stores,
        list(id ORDER BY id) FILTER (WHERE id < 100) AS edge
      FROM read_parquet('${dir}/*/*.parquet', hive_partitioning = true)`))[0]
    assert.deepEqual(got.stores, want.stores, `${month} 的門市應該是 ${JSON.stringify(want.stores)}，Parquet 裡是 ${JSON.stringify(got.stores)}：只匯出那個月的訂單`)
    return { want, got }
  }

  test('2026-03：只有 3 月的訂單，月初 00:00 與月底 23:59:59.999 都要在', async () => {
    const { want, got } = await check('2026-03', '2026-03-01', '2026-04-01')
    assert.deepEqual(got.edge, ['12', '13'],
      `月界的訂單只應該有 12（03-01 00:00）與 13（03-31 23:59:59.999），實際是 ${JSON.stringify(got.edge)}：條件寫 ordered_at >= 當月 1 日 AND ordered_at < 下個月 1 日；BETWEEN '2026-03-01' AND '2026-03-31' 會漏掉 31 日 00:00 之後的訂單`)
    assert.equal(got.n, want.n, `3 月有 ${want.n} 筆，Parquet 裡有 ${got.n} 筆`)
    assert.equal(got.s, want.s, `3 月 total 合計 ${want.s}，Parquet 裡是 ${got.s}`)
  })

  test('2026-02（28 天）與 2026-04 也正確', async () => {
    for (const [month, from, to] of [['2026-02', '2026-02-01', '2026-03-01'], ['2026-04', '2026-04-01', '2026-05-01']]) {
      const { want, got } = await check(month, from, to)
      assert.equal(got.n, want.n, `${month} 有 ${want.n} 筆，Parquet 裡有 ${got.n} 筆：範圍是 >= 當月 1 日、< 下個月 1 日；下個月 1 日用 CAST(… AS DATE) + INTERVAL 1 MONTH 算，不要寫死 31 天`)
      assert.equal(got.s, want.s, `${month} total 合計 ${want.s}，Parquet 裡是 ${got.s}`)
    }
  })

  test('month 格式不對就丟錯', async () => {
    for (const bad of ['2026-3', '2026-13', "2026-03' OR true --"]) {
      await assert.rejects(exportMonth(duck, bad, newDir()), `month = ${JSON.stringify(bad)} 要丟錯：先用 /^\\d{4}-(0[1-9]|1[0-2])$/ 檢查`)
    }
  })
})
