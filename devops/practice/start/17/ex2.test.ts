// 練習 2：不停機把 customers.phone 改名為 mobile（expand → 部署 → 回填 → 部署 → contract）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import pg from 'pg'
import { runner } from 'node-pg-migrate'
import { readJson } from '../../helpers/docker.ts'
import { admin, exec, freshDb, sleep, startPg, stopPg } from './pg-test.ts'

const dir = join(import.meta.dirname, 'rename')
const STEPS = ['migrate 002', 'deploy v2', 'backfill', 'deploy v3', 'migrate 003']
const FILES: Record<string, string> = { 'migrate 002': '002_add_mobile', 'migrate 003': '003_drop_phone' }
const silent = { info() {}, warn() {}, error() {}, debug() {} }
const migrate = (databaseUrl: string, file: string) =>
  runner({ databaseUrl, dir: join(dir, 'migrations'), direction: 'up', migrationsTable: 'pgmigrations', file, logger: silent })
const phone = () => '09' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0')

// 建好 001、灌 5000 位顧客，回傳 id → phone
async function seed(databaseUrl: string, db: string) {
  await migrate(databaseUrl, '001_customers')
  const { rows } = await admin(`INSERT INTO customers (name, phone)
    SELECT '顧客' || g, '09' || lpad((random() * 1e8)::bigint::text, 8, '0') FROM generate_series(1, 5000) g RETURNING id, phone`, db)
  return new Map(rows.map(r => [Number(r.id), r.phone as string]))
}

// 測試自己裝的紀錄：每一句更新 customers 的 SQL，記下它的交易編號、更新了幾列、什麼時候結束
async function logUpdates(db: string) {
  await admin(`CREATE TABLE ld17_log (xid bigint, n int, at timestamptz);
    CREATE FUNCTION ld17_log() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO ld17_log SELECT txid_current(), count(*), clock_timestamp() FROM changed; RETURN NULL; END $$;
    CREATE TRIGGER ld17_log AFTER UPDATE ON customers REFERENCING NEW TABLE AS changed
      FOR EACH STATEMENT EXECUTE FUNCTION ld17_log();`, db)
}

before(startPg)
after(stopPg)

test('plan.json 依序列出 5 個步驟', () => {
  const plan = readJson(dir, 'plan.json')
  assert.ok(Array.isArray(plan), 'plan.json 要是陣列，例如 ["migrate 002", …]')
  assert.deepEqual([...plan].sort(), [...STEPS].sort(), `plan.json 要剛好包含這 5 個步驟各一次（順序由你決定）：${STEPS.join('、')}`)
})

test('002 和 003 等不到鎖時 10 秒內就放棄（lock_timeout），不讓後面的查詢一直排隊', async () => {
  const databaseUrl = await freshDb('rename_locks')
  await migrate(databaseUrl, '001_customers')
  for (const file of ['002_add_mobile', '003_drop_phone']) {
    // 模擬一份跑很久的報表：交易讀著 customers 不結束，拿著 ACCESS SHARE 鎖
    const holder = new pg.Client({ connectionString: databaseUrl })
    await holder.connect()
    await holder.query('BEGIN')
    await holder.query('SELECT count(*) FROM customers')
    const res = migrate(databaseUrl, file).then(() => 'ok', (e: Error & { code?: string }) => e)
    const first = await Promise.race([res, sleep(10_000).then(() => 'waiting')])
    await holder.query('ROLLBACK')
    await holder.end()
    await res
    assert.notEqual(first, 'waiting', `${file}.sql 等鎖等了 10 秒還在等：這段時間 app 對 customers 的查詢全部排在它後面。在檔案開頭 SET lock_timeout（例如 '3s'）`)
    assert.notEqual(first, 'ok', `報表拿著 customers 的鎖時，${file}.sql 還是直接套用成功了：它應該要改 customers 的欄位（ALTER TABLE customers …）`)
    const e = first as Error & { code?: string }
    assert.ok(e.code === '55P03' || /lock timeout/.test(e.message), `${file}.sql 失敗的原因不是等鎖逾時：${e.message}`)
    // 鎖放掉之後重新套用，下一個檔案才有 mobile 欄位可以接著測
    await migrate(databaseUrl, file).catch(err => assert.fail(`沒有人拿著鎖時，${file}.sql 套用失敗：${err.message}`))
  }
})

test('照 plan.json 一步一步做，每一步期間線上的版本持續讀寫都不出錯，最後所有顧客的 mobile 都正確', async () => {
  const plan: string[] = readJson(dir, 'plan.json')
  assert.deepEqual([...plan].sort(), [...STEPS].sort(), 'plan.json 的步驟不對，先通過第一個測試')
  const databaseUrl = await freshDb('rename_plan')
  const expected = await seed(databaseUrl, 'rename_plan')
  const ids = [...expected.keys()]
  await logUpdates('rename_plan')
  const apps: Record<string, any> = {}
  for (const v of ['v1', 'v2', 'v3']) apps[v] = await import(join(dir, 'apps', `${v}.ts`))
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 6 })
  const errors: string[] = []
  // 模擬線上的 app：每個版本一個迴圈，新增一位顧客、再隨機讀一位，讀到的電話要對
  const traffic = (versions: string[], step: string) => {
    let stop = false
    const loops = versions.map(async v => {
      while (!stop) {
        try {
          const p = phone()
          const id = await apps[v].addCustomer(pool, '線上新顧客', p)
          expected.set(id, p)
          ids.push(id)
          const pick = ids[Math.floor(Math.random() * ids.length)]
          const got = await apps[v].getPhone(pool, pick)
          if (got !== expected.get(pick)) errors.push(`「${step}」期間 ${v} 讀 id=${pick} 拿到 ${got}，應該是 ${expected.get(pick)}`)
        } catch (e) {
          errors.push(`「${step}」期間 ${v} 出錯：${(e as Error).message}`)
        }
        await sleep(15)
      }
    })
    return async () => { stop = true; await Promise.all(loops) }
  }
  let live = ['v1']
  try {
    for (const step of plan) {
      if (step.startsWith('deploy ')) {
        // 滾動部署：新舊版本同時在跑一段時間，然後舊版下線
        const next = step.slice(7)
        const done = traffic([...live, next], step)
        await sleep(800)
        await done()
        live = [next]
        continue
      }
      const done = traffic(live, step)
      await sleep(300)
      try {
        if (step === 'backfill') {
          const r = await exec('node', ['backfill.ts'], { cwd: dir, env: { DATABASE_URL: databaseUrl, BATCH_SIZE: '500' }, timeout: 60_000 })
          assert.equal(r.code, 0, `「backfill」：node backfill.ts 沒有以 exit 0 結束：${r.stderr || r.stdout}`.slice(0, 600))
        } else {
          await migrate(databaseUrl, FILES[step]).catch(e => assert.fail(`「${step}」套用 ${FILES[step]}.sql 失敗：${e.message}`))
        }
        await sleep(300)
      } finally {
        await done()
      }
      if (errors.length) break
    }
    assert.equal(errors.length, 0, `線上的版本出錯了 ${errors.length} 次，例如：\n${errors.slice(0, 3).join('\n')}\n想想每一步的當下，哪些版本還在跑、它們讀寫哪些欄位`)
    const { rows } = await pool.query('SELECT id, mobile FROM customers')
    const wrong = rows.filter(r => r.mobile !== expected.get(Number(r.id)))
    assert.equal(wrong.length, 0, `有 ${wrong.length} 位顧客的 mobile 不對，例如 id=${wrong[0]?.id} 是 ${wrong[0]?.mobile}、應該是 ${expected.get(Number(wrong[0]?.id))}：回填要在所有寫入都會寫 mobile 之後才做`)
    const { rows: [log] } = await admin('SELECT coalesce(max(n), 0) AS biggest FROM ld17_log', 'rename_plan')
    assert.ok(log.biggest > 100 && log.biggest <= 500, `「backfill」用 BATCH_SIZE=500 執行，最大的一批卻更新了 ${log.biggest} 列：每批的列數要讀環境變數 BATCH_SIZE，不要寫死`)
    const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name IN ('phone', 'mobile') ORDER BY 1`)
    assert.deepEqual(cols.rows.map(r => r.column_name), ['mobile'], '最後 customers 只能剩 mobile：003 要刪掉 phone')
  } finally {
    await pool.end()
  }
})

test('回填分批（BATCH_SIZE=100 → 至少 50 批、每批一個交易），中途被殺掉後重跑能接著做完', async () => {
  const databaseUrl = await freshDb('rename_backfill')
  const expected = await seed(databaseUrl, 'rename_backfill')
  await migrate(databaseUrl, '002_add_mobile').catch(e => assert.fail(`套用 002_add_mobile.sql 失敗：${e.message}`))
  await logUpdates('rename_backfill')
  const env = { DATABASE_URL: databaseUrl, BATCH_SIZE: '100' }
  let lines = 0
  const first = await exec('node', ['backfill.ts'], { cwd: dir, env, timeout: 120_000, onLine: () => ++lines >= 10 })
  assert.ok(lines >= 10, `第一次執行只印了 ${lines} 行就結束（exit ${first.code}）：BATCH_SIZE=100 時 5000 列要分成 50 批，每處理完一批印一行進度。${first.stderr}`.slice(0, 600))
  const { rows: [{ now: secondStart }] } = await admin('SELECT clock_timestamp() AS now', 'rename_backfill')
  const second = await exec('node', ['backfill.ts'], { cwd: dir, env, timeout: 120_000 })
  assert.equal(second.code, 0, `被中斷後重跑沒有以 exit 0 結束：${second.stderr || second.stdout}`.slice(0, 600))
  const progress = lines + second.stdout.split('\n').filter(l => l.trim()).length
  assert.ok(progress >= 50, `兩次合計只印了 ${progress} 行進度：5000 列、BATCH_SIZE=100 至少有 50 批，每批印一行`)
  const { rows: [log] } = await admin(`SELECT count(*)::int AS stmts, count(DISTINCT xid)::int AS txs, coalesce(max(n), 0) AS biggest, coalesce(sum(n), 0)::int AS total
    FROM ld17_log WHERE n > 0`, 'rename_backfill')
  assert.ok(log.biggest <= 100, `有一句 UPDATE 一次改了 ${log.biggest} 列：每批最多 BATCH_SIZE（環境變數，這次是 100）列`)
  assert.ok(log.stmts >= 50 && log.txs >= 50, `只用了 ${log.stmts} 句 UPDATE、${log.txs} 個交易：每批要自己一個交易、做完就 commit，不要把整個回填包在一個交易裡`)
  // 第二次執行沒被打斷：相鄰兩批之間的間隔（中位數）要看得出有休息
  const { rows: [gap] } = await admin(`SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ms), 0) AS ms FROM (
    SELECT extract(epoch FROM at - lag(at) OVER (ORDER BY at)) * 1000 AS ms FROM ld17_log WHERE at >= $1) g WHERE ms IS NOT NULL`, 'rename_backfill', [secondStart])
  assert.ok(gap.ms >= 20, `相鄰兩批的間隔中位數只有 ${Number(gap.ms).toFixed(1)} 毫秒：批次之間要休息一下（例如 await 一個 50 毫秒的 setTimeout），讓 app 的查詢、VACUUM 有空檔`)
  assert.ok(log.total <= 5000, `兩次執行合計更新了 ${log.total} 列（只有 5000 列要補）：重跑時要跳過已經補好的列（例如 WHERE mobile IS NULL）`)
  const { rows } = await admin('SELECT id, mobile FROM customers', 'rename_backfill')
  assert.equal(rows.length, 5000, `customers 變成 ${rows.length} 列：回填只能更新，不能新增或刪除`)
  const wrong = rows.filter(r => r.mobile !== expected.get(Number(r.id)))
  assert.equal(wrong.length, 0, `有 ${wrong.length} 列的 mobile 跟 phone 不一樣（例如 id=${wrong[0]?.id}）`)
})
