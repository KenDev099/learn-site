// 練習 1：登入、區分「信箱還沒驗證」與「帳密錯」、帶著使用者的 token 讀自己的訂單
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createUser, deleteUsers, dropTaskSchema, recordingProxy, requireStack, slugOf, sql, stack, type TestUser } from '../../helpers/supa.ts'
import { configFor, ordersSchema } from './harness.ts'
import { login } from './login.ts'

const dir = import.meta.dirname
let schema: string, a: TestUser, b: TestUser
let proxy: Awaited<ReturnType<typeof recordingProxy>>
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  schema = await ordersSchema(dir)
  a = await createUser(dir, 'a')
  b = await createUser(dir, 'b')
  await sql(`insert into ${schema}.orders (customer_id, total) values ($1, 190), ($2, 220), ($1, 80)`, [a.id, b.id])
  proxy = await recordingProxy()
})
after(async () => {
  await proxy?.close()
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

test('登入後只讀到自己的訂單', async () => {
  const r = await login(configFor(schema), a.email, a.password)
  assert.ok(r.ok, `帳密正確應該登入成功，實際回傳 ${JSON.stringify(r)}`)
  assert.equal(r.userId, a.id, 'userId 是登入的人的 id（signInWithPassword 回傳的 data.user.id）')
  assert.deepEqual(r.orders.map(o => o.total), [190, 80],
    '顧客 A 有兩張訂單（190、80），依 id 排序；讀到 220 代表看到了別人的訂單：查詢要用 publishable key、帶著使用者的 token，讓 RLS 決定；拿到 [] 代表查詢沒有帶上登入後的 token')
})

test('請求用 publishable key，查訂單時帶的是使用者的 access token', async () => {
  proxy.requests.length = 0
  await login(configFor(schema, proxy.url), a.email, a.password)
  assert.ok(proxy.requests.length >= 2, '至少要有登入與查訂單兩個請求，而且都要打傳進來的 cfg.url')
  for (const r of proxy.requests) assert.equal(r.headers.apikey, stack().PUBLISHABLE_KEY,
    `${r.method} ${r.path} 用的不是 publishable key：secret key 會繞過 RLS，登入與讀資料都不該用它`)
  const read = proxy.requests.find(r => r.path.endsWith('/orders'))
  assert.ok(read, '沒有看到讀 orders 的請求')
  const token = String(read.headers.authorization ?? '').replace(/^Bearer /, '')
  const role = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString() || '{}').role
  assert.equal(role, 'authenticated', '讀 orders 時 Authorization 要是登入後拿到的使用者 token（role 是 authenticated），用登入那個 client 查詢就會自動帶上')
})

test('信箱還沒驗證：回傳 reason unconfirmed', async () => {
  const email = `${slugOf(dir)}-unconfirmed@learn.test`
  await sql('delete from auth.users where email = $1', [email])
  const admin = createClient(stack().API_URL, stack().SECRET_KEY, { auth: { persistSession: false } })
  const created = await admin.auth.admin.createUser({ email, password: 'pw-unconfirmed', email_confirm: false })
  assert.equal(created.error, null, '建立測試使用者失敗')
  assert.deepEqual(await login(configFor(schema), email, 'pw-unconfirmed'), { ok: false, reason: 'unconfirmed' },
    '還沒點驗證信的人登入，Auth 回 error.code email_not_confirmed：畫面要提示「去收信」，不是「帳密錯誤」')
})

test('密碼錯：回傳 reason invalid', async () => {
  assert.deepEqual(await login(configFor(schema), a.email, 'wrong-password'), { ok: false, reason: 'invalid' },
    '帳密錯時 error.code 是 invalid_credentials，回傳 { ok: false, reason: "invalid" }')
})
