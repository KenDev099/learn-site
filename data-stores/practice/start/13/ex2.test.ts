import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api'
import { usePg } from '../../helpers/pg.ts'
import { syncOrders } from './etl.ts'

const db = usePg(13)

// 記下 syncOrders 對 PostgreSQL 下的每個查詢與回傳筆數
function watchPg(pool: Pool) {
  const log: { text: string; rows: number }[] = []
  const proxy = new Proxy(pool, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (prop !== 'query') return typeof v === 'function' ? v.bind(target) : v
      return async (q: string | { text: string }, ...rest: unknown[]) => {
        const r = await (target.query as Function)(q, ...rest)
        log.push({ text: typeof q === 'string' ? q : q.text, rows: r.rowCount ?? 0 })
        return r
      }
    },
  })
  return { proxy, log }
}

// 記下對 DuckDB 下的 SQL；failInsert = N 時，第 N 個 INSERT 在執行前丟錯（模擬程序在那一刻當機）
function watchDuck(duck: DuckDBConnection, failInsert = 0) {
  const sql: string[] = []
  let inserts = 0
  const proxy = new Proxy(duck, {
    get(target, prop) {
      const v = Reflect.get(target, prop, target)
      if (typeof v !== 'function') return v
      return (...args: unknown[]) => {
        if (typeof args[0] === 'string') {
          sql.push(args[0])
          if (/^\s*insert\b/i.test(args[0]) && ++inserts === failInsert) return Promise.reject(new Error('模擬當機：第 2 批的 INSERT 沒有執行'))
        }
        return v.apply(target, args)
      }
    },
  })
  return { proxy, sql }
}

describe('練習 2：增量 ETL（水位線＋冪等寫入）', { timeout: 60_000 }, () => {
  let instance: DuckDBInstance
  let duck: DuckDBConnection

  const addOrders = (from: number, n: number) => db.query(`
    INSERT INTO orders (store_id, customer_id, ordered_at, total)
    SELECT 11 + g % 6, CASE WHEN g % 7 = 0 THEN NULL ELSE 101 + g % 500 END,
           timestamp '2026-03-01 07:00' + g * interval '37 seconds' + (g % 1000) * interval '1 millisecond',
           round((70 + (g % 97) * 1.7)::numeric, 1)
    FROM generate_series($1::int, $2::int) AS g`, [from, from + n - 1])

  // 一筆被回滾的結帳：交易回滾了，序號卻不會退回，id 因此跳號（正式資料庫的 id 一定會有洞）
  async function rolledBack(n: number) {
    const c = await db.connect()
    try {
      await c.query('BEGIN')
      await c.query(`INSERT INTO orders (store_id, ordered_at, total) SELECT 11, timestamp '2026-03-01', 80 FROM generate_series(1, $1::int)`, [n])
      await c.query('ROLLBACK')
    } finally {
      c.release()
    }
  }

  async function same(what: string) {
    const p = (await db.query(`SELECT count(*)::int AS n, sum(total)::text AS s, max(id)::text AS m,
      (SELECT ordered_at::text FROM orders WHERE id = 11000) AS t FROM orders`)).rows[0]
    const d = (await duck.runAndReadAll(`SELECT count(*) AS n, count(DISTINCT id) AS ids, CAST(sum(total) AS VARCHAR) AS s,
      (SELECT CAST(ordered_at AS VARCHAR) FROM orders WHERE id = 11000) AS t FROM orders`)).getRowObjectsJson()[0]
    assert.equal(Number(d.ids), Number(d.n), `${what}：DuckDB 裡有重複的訂單 id`)
    assert.equal(Number(d.n), p.n, `${what}：PostgreSQL 有 ${p.n} 筆，DuckDB 有 ${d.n} 筆`)
    assert.equal(d.s, p.s, `${what}：SUM(total) 不一致（PostgreSQL ${p.s}，DuckDB ${d.s}）：total 要用文字傳，存成 DECIMAL`)
    assert.equal(d.t, p.t, `${what}：訂單 11000 的 ordered_at 不一致（PostgreSQL ${p.t}，DuckDB ${d.t}）：在 SQL 裡用 ordered_at::text，不要經過 JS 的 Date`)
    const w = (await duck.runAndReadAll(`SELECT CAST(last_id AS VARCHAR) AS w FROM etl_state WHERE name = 'orders'`)).getRowObjectsJson()[0].w
    assert.equal(w, p.m, `${what}：etl_state.last_id 應該是最後一筆的 id ${p.m}，實際 ${w}：用這批最後一筆的 id，不要用「舊水位線＋筆數」（id 會跳號）`)
  }

  function checkQueries(log: { text: string; rows: number }[], max: number) {
    assert.ok(log.length > 0, '沒有呼叫 db.query：從 PostgreSQL 讀訂單要用 db.query')
    for (const q of log) {
      assert.doesNotMatch(q.text, /\boffset\b/i, '用了 OFFSET：OFFSET 越後面越慢（要先數過前面的列），而且資料變動時會跳過或重複；用 WHERE id > 水位線 ORDER BY id LIMIT 1000')
      assert.ok(q.rows <= 1000, `一次查詢回傳 ${q.rows} 筆，每批最多 1000 筆（LIMIT 1000）`)
    }
    const read = log.reduce((a, q) => a + q.rows, 0)
    assert.ok(read <= max, `這次從 PostgreSQL 讀了 ${read} 筆，只有 ${max} 筆是新的：從 etl_state 的 last_id 之後開始讀、每批的水位線設成那批最後一筆的 id，不要每次全量複製`)
  }

  before(async () => {
    instance = await DuckDBInstance.create(':memory:')
    duck = await instance.connect()
    await duck.run(`CREATE TABLE orders (id BIGINT PRIMARY KEY, store_id INTEGER, customer_id INTEGER, ordered_at TIMESTAMP, total DECIMAL(10,1))`)
    await duck.run(`CREATE TABLE etl_state (name VARCHAR PRIMARY KEY, last_id BIGINT)`)
    await duck.run(`INSERT INTO etl_state VALUES ('orders', 0)`)
    await db.query(`CREATE TABLE orders (
      id bigint GENERATED ALWAYS AS IDENTITY (START WITH 10001) PRIMARY KEY,
      store_id int NOT NULL, customer_id int, ordered_at timestamp NOT NULL, total numeric(10,1) NOT NULL)`)
  })
  after(() => {
    duck?.closeSync()
    instance?.closeSync()
  })

  test('第一次同步：3,200 筆分批複製，每批 ≤ 1,000 筆、不用 OFFSET', async () => {
    await addOrders(1, 3200)
    const pg = watchPg(db)
    const n = await syncOrders(pg.proxy, duck)
    checkQueries(pg.log, 3200)
    assert.equal(n, 3200, `回傳值應該是寫入的筆數 3200，實際 ${n}`)
    await same('第一次同步後')
  })

  test('增量：PostgreSQL 新增 2,500 筆後再同步，只讀新的資料', async () => {
    await rolledBack(37)
    await addOrders(3201, 2500)
    const pg = watchPg(db)
    const n = await syncOrders(pg.proxy, duck)
    checkQueries(pg.log, 2500)
    assert.equal(n, 2500, `這次只有 2500 筆新訂單，回傳 ${n}`)
    await same('增量同步後')
  })

  test('第 2 批寫入時當機：交易回滾、水位線沒有前進，重跑後資料完整', async () => {
    await rolledBack(5)
    await addOrders(5701, 1200)
    await rolledBack(5)
    await addOrders(6901, 1300)
    const start = (await duck.runAndReadAll(`SELECT CAST(last_id AS VARCHAR) AS w FROM etl_state`)).getRowObjectsJson()[0].w
    const batch1 = (await db.query(`SELECT max(id)::text AS m FROM (SELECT id FROM orders WHERE id > $1 ORDER BY id LIMIT 1000) b`, [start])).rows[0].m
    const crash = watchDuck(duck, 2)
    await assert.rejects(syncOrders(db, crash.proxy), /模擬當機/, '第 2 批的 INSERT 丟錯時，syncOrders 要把錯誤往外丟')
    try {
      await duck.run('BEGIN TRANSACTION')
      await duck.run('ROLLBACK')
    } catch {
      assert.fail('出錯之後 DuckDB 的交易還開著：catch 裡要先 ROLLBACK 再丟錯，不然下一次 BEGIN 會失敗')
    }
    const mid = (await duck.runAndReadAll(`SELECT CAST(last_id AS VARCHAR) AS w, (SELECT count(*) FROM orders) AS n FROM etl_state`)).getRowObjectsJson()[0]
    assert.equal(String(mid.w), batch1,
      `當機後 last_id 是 ${mid.w}：第 1 批（到 id ${batch1}）已經提交，第 2 批沒寫進去，水位線就要停在 ${batch1}。水位線要跟資料在同一個交易裡、寫完資料才更新`)
    assert.ok(crash.sql.some(s => /^\s*begin/i.test(s)), '沒有開交易：每一批用 BEGIN TRANSACTION … COMMIT 包起來')
    let open = false
    for (const s of crash.sql) {
      if (/^\s*begin/i.test(s)) open = true
      else if (/^\s*(commit|rollback)/i.test(s)) open = false
      else if (/^\s*update\s+etl_state/i.test(s)) assert.ok(open, '更新 etl_state 的 UPDATE 不在 BEGIN … COMMIT 裡：水位線要跟同一批資料在同一個交易裡更新')
    }
    const n = await syncOrders(db, duck)
    assert.equal(n, 1500, `重跑時應該從第 2 批接著做，寫入剩下的 1500 筆，實際 ${n}`)
    await same('當機後重跑')
  })

  test('水位線退回（例如從備份還原）：重送的訂單不會重複，內容更新成最新的', async () => {
    await db.query(`UPDATE orders SET total = total + 1000 WHERE id = 10700`)
    await duck.run(`UPDATE etl_state SET last_id = 10500`)
    const n = await syncOrders(db, duck).catch((e: Error) =>
      assert.fail(`重送時出錯（${e.message}）：DuckDB 已經有的 id 要用新資料覆蓋，用 INSERT OR REPLACE`))
    assert.equal(n, 8200 - 500, `last_id 退回 10500，應該重送 ${8200 - 500} 筆，實際 ${n}`)
    await same('重送之後')
    const t = (await duck.runAndReadAll(`SELECT CAST(total AS VARCHAR) AS t FROM orders WHERE id = 10700`)).getRowObjectsJson()[0].t
    const want = (await db.query(`SELECT total::text AS t FROM orders WHERE id = 10700`)).rows[0].t
    assert.equal(t, want, `訂單 10700 在 PostgreSQL 改過，重送後 DuckDB 要是新的金額 ${want}，實際 ${t}`)
  })
})
