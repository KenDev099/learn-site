import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { join } from 'node:path'
import pg from 'pg'
import { COFFEE_SQL, createTestDb } from '../../helpers/db.ts'
import { ConflictError, DatabaseUnavailableError, ValidationError } from './errors.ts'

const opts = { timeout: 15_000 }
type Create = (pool: pg.Pool, input: { name: string, phone: string }) => Promise<{ id: number, name: string, phone: string }>

const { pool } = await createTestDb([COFFEE_SQL, join(import.meta.dirname, 'schema.sql')])

async function load() {
  const mod: { createCustomer?: unknown } = await import('./customers.ts')
  assert.equal(typeof mod.createCustomer, 'function', 'customers.ts 要 export createCustomer(pool, input)')
  return mod.createCustomer as Create
}
const phone = () => `09${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`

// 只有 query 的假池子：丟出指定的錯誤（例如 lc_messages 是中文時的訊息）
const failingPool = (err: Error) => ({ query: async () => { throw err } }) as unknown as pg.Pool

test('成功時回傳新顧客', opts, async () => {
  const create = await load()
  const p = phone()
  const c = await create(pool, { name: '吳佳穎', phone: p })
  assert.equal(typeof c.id, 'number')
  assert.deepEqual({ name: c.name, phone: c.phone }, { name: '吳佳穎', phone: p })
})

test('手機重複 → ConflictError（field phone，cause 是 23505）', opts, async () => {
  const create = await load()
  const p = phone()
  await create(pool, { name: '周冠宇', phone: p })
  const err = await create(pool, { name: '周冠宇二號', phone: p }).then(() => null, (e: unknown) => e)
  assert.ok(err instanceof ConflictError, `手機重複要丟 ConflictError，收到 ${String(err)}`)
  assert.equal(err.field, 'phone')
  assert.equal((err.cause as { code?: string } | undefined)?.code, '23505', 'cause 要放原本的錯誤')
})

test('判斷靠 code 和 constraint，不靠訊息文字（資料庫的語系不同，訊息就不同）', opts, async () => {
  const create = await load()
  const dup = Object.assign(new Error('重複的索引鍵值違反唯一限制 "customers_phone_key"'), { code: '23505', constraint: 'customers_phone_key' })
  const e1 = await create(failingPool(dup), { name: '吳佳穎', phone: phone() }).then(() => null, (e: unknown) => e)
  assert.ok(e1 instanceof ConflictError, `訊息是中文的 23505 也要轉成 ConflictError，收到 ${String(e1)}`)
  const check = Object.assign(new Error('新資料列違反檢查限制 "customers_name_check"'), { code: '23514', constraint: 'customers_name_check' })
  const e2 = await create(failingPool(check), { name: 'x', phone: phone() }).then(() => null, (e: unknown) => e)
  assert.ok(e2 instanceof ValidationError, `訊息是中文的 23514 也要轉成 ValidationError，收到 ${String(e2)}`)
  const other = Object.assign(new Error('duplicate key value violates unique constraint "orders_pkey"'), { code: '23505', constraint: 'orders_pkey' })
  const e3 = await create(failingPool(other), { name: '吳佳穎', phone: phone() }).then(() => null, (e: unknown) => e)
  assert.equal(e3, other, '不是手機的唯一約束：不知道怎麼對使用者說，原樣丟出')
})

test('名稱違反 CHECK → ValidationError（field name）', opts, async () => {
  const create = await load()
  for (const name of ['', '   ', '咖'.repeat(51)]) {
    const err = await create(pool, { name, phone: phone() }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof ValidationError, `name ${JSON.stringify(name.slice(0, 10))} 違反 CHECK，要丟 ValidationError，收到 ${String(err)}`)
    assert.equal(err.field, 'name')
    assert.equal((err.cause as { code?: string } | undefined)?.code, '23514')
  }
})

test('連不上資料庫、查詢逾時 → DatabaseUnavailableError', opts, async () => {
  const create = await load()
  const timeout = Object.assign(new Error('由於陳述式逾時，正在取消陳述式'), { code: '57014' })
  const e0 = await create(failingPool(timeout), { name: '吳佳穎', phone: phone() }).then(() => null, (e: unknown) => e)
  assert.ok(e0 instanceof DatabaseUnavailableError, `statement_timeout 取消查詢（57014）要丟 DatabaseUnavailableError，收到 ${String(e0)}`)
  assert.equal(e0.cause, timeout, 'cause 要放原本的錯誤')
  // 借一個 port 再關掉，保證沒有人在聽
  const port = await new Promise<number>(resolve => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port
      s.close(() => resolve(p))
    })
  })
  const down = new pg.Pool({ connectionString: `postgres://learn:learn@127.0.0.1:${port}/coffee`, connectionTimeoutMillis: 1000 })
  try {
    const err = await create(down, { name: '吳佳穎', phone: phone() }).then(() => null, (e: unknown) => e)
    assert.ok(err instanceof DatabaseUnavailableError, `連不上時要丟 DatabaseUnavailableError，收到 ${String(err)}`)
    assert.equal((err.cause as { code?: string } | undefined)?.code, 'ECONNREFUSED', 'cause 要放原本的錯誤')
  } finally {
    await down.end()
  }
})

test('其他錯誤原樣往上丟，不吞掉', opts, async () => {
  const create = await load()
  // 字串裡的 \0 是 PostgreSQL 不接受的位元組（22021）
  const err = await create(pool, { name: '吳\u0000佳穎', phone: phone() }).then(() => null, (e: unknown) => e)
  assert.ok(err instanceof Error, `要丟出錯誤，不能回傳 ${JSON.stringify(err)}`)
  assert.equal((err as { code?: string }).code, '22021', `不認得的錯誤要原樣丟出（code 22021），收到 ${String(err)}`)
})
