import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import type pg from 'pg'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { DatabaseUnavailableError } from './errors.ts'

const opts = { timeout: 15_000 }
type DbModule = { createPool?: (url: string) => pg.Pool, health?: (pool: pg.Pool) => Promise<void> }

async function load() {
  const mod: DbModule = await import('./db.ts')
  assert.equal(typeof mod.createPool, 'function', 'db.ts 要 export createPool(url)')
  assert.equal(typeof mod.health, 'function', 'db.ts 要 export health(pool)')
  return mod as Required<DbModule>
}

const { url, pool: admin } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

test('statement_timeout：跑太久的 SQL 大約 2 秒被資料庫取消（57014）', opts, async () => {
  const { createPool } = await load()
  const pool = createPool(url)
  try {
    const started = Date.now()
    const err = await pool.query('SELECT pg_sleep(3)').then(() => null, (e: { code?: string }) => e)
    const ms = Date.now() - started
    assert.ok(err, 'SELECT pg_sleep(3) 應該被取消，卻跑完了：要設 statement_timeout: 2000')
    assert.equal(err.code, '57014', `要是資料庫取消查詢的 57014，收到 ${err.code}`)
    assert.ok(ms >= 1500 && ms < 2800, `大約 2 秒時取消，實際 ${ms}ms：statement_timeout 要設 2000`)
  } finally {
    await pool.end()
  }
})

test('連線全被借走時，下一個 connect() 在 1 秒左右失敗，不是一直等（max 5、connectionTimeoutMillis 1000）', opts, async () => {
  const { createPool } = await load()
  const pool = createPool(url)
  const held: pg.PoolClient[] = []
  try {
    for (let i = 0; i < 5; i++) held.push(await pool.connect())
    const started = Date.now()
    const sixth = pool.connect()
    const result = await Promise.race([
      sixth.then(c => { c.release(); return 'got' }, () => 'rejected'),
      new Promise(r => setTimeout(r, 2000, 'waiting')),
    ])
    const ms = Date.now() - started
    assert.notEqual(result, 'got', '借出 5 條還沒還時，第 6 個 connect() 不該拿得到連線：max 要設 5')
    assert.notEqual(result, 'waiting', '第 6 個 connect() 等了 2 秒還沒結果：沒設 connectionTimeoutMillis 時會永遠等')
    assert.ok(ms >= 700 && ms < 1600, `大約 1 秒失敗，實際 ${ms}ms：connectionTimeoutMillis 要設 1000`)
    assert.equal(pool.options.idleTimeoutMillis, 10000, `idleTimeoutMillis 要設 10000（閒置 10 秒的連線關掉），收到 ${pool.options.idleTimeoutMillis}`)
  } finally {
    for (const c of held) c.release()
    await pool.end()
  }
})

test('health()：正常時通過；密碼錯時丟 DatabaseUnavailableError，cause 是原本的錯誤', opts, async () => {
  const { createPool, health } = await load()
  const good = createPool(url)
  try {
    await health(good)
  } finally {
    await good.end()
  }
  const bad = createPool(url.replace('learn:learn@', 'learn:wrong-password@'))
  try {
    const err = await health(bad).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof DatabaseUnavailableError, `密碼錯時要丟 DatabaseUnavailableError，收到 ${String(err)}`)
    assert.equal((err.cause as { code?: string } | undefined)?.code, '28P01', 'cause 要是 pg 原本的錯誤（密碼錯是 28P01）')
  } finally {
    await bad.end()
  }
})

test('閒置的連線被資料庫切斷時，程序不崩潰，之後的查詢照常', opts, async () => {
  const { createPool } = await load()
  const pool = createPool(url)
  try {
    const client = await pool.connect()
    const pid = (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid
    client.release()   // 還回池子，變成閒置
    const crashed: unknown[] = []
    const onCrash = (e: unknown) => crashed.push(e)
    process.on('uncaughtException', onCrash)
    try {
      await admin.query('SELECT pg_terminate_backend($1)', [pid])
      await new Promise(r => setTimeout(r, 300))
    } finally {
      process.off('uncaughtException', onCrash)
    }
    assert.equal(crashed.length, 0, `閒置連線被切斷時出現沒處理的錯誤（${String(crashed[0])}）：要加 pool.on('error', …)`)
    const { rows } = await pool.query<{ ok: number }>('SELECT 1 AS ok')
    assert.equal(rows[0].ok, 1, '切斷之後再查詢，池子要換一條新連線')
  } finally {
    await pool.end()
  }
})
