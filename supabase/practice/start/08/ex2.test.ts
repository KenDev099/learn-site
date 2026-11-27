// 練習 2：Edge Function checkout：用呼叫者的身分下單，再用伺服器端的金鑰扣款
// 測試用 edge-runtime 的 Docker 映像跑你的 functions/checkout（第一次會下載映像，本機 Supabase 已經有就不用）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, createUser, deleteUsers, dropTaskSchema, recordingProxy, requireStack, sql, stack, type TestUser } from '../../helpers/supa.ts'
import { fakePayments, localize, serveFunction, shopSchema, waitRpc } from './harness.ts'

const dir = import.meta.dirname
const paymentKey = 'pk_test_' + randomBytes(8).toString('hex')   // 每次判分都不一樣：寫死在程式碼裡的金鑰對不上
let schema: string, a: TestUser
let proxy: Awaited<ReturnType<typeof recordingProxy>>, payments: Awaited<ReturnType<typeof fakePayments>>, fn: ReturnType<typeof serveFunction>
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  schema = await shopSchema(dir)
  a = await createUser(dir, 'a')
  // 練習 2 用你在練習 1 寫的 place_order
  await applySql(schema, localize(readFileSync(join(dir, 'place_order.sql'), 'utf8'), schema))
  await waitRpc(schema, 'place_order')
  proxy = await recordingProxy()
  payments = await fakePayments(paymentKey)
  const { PUBLISHABLE_KEY, SECRET_KEY } = stack()
  fn = serveFunction(dir, 'checkout', {
    SUPABASE_URL: proxy.url.replace('localhost', 'host.docker.internal'),
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLISHABLE_KEY }),
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }),
    PAYMENT_API_URL: `http://host.docker.internal:${payments.port}`,
    PAYMENT_API_KEY: paymentKey,
    DB_SCHEMA: schema,
  })
})
after(async () => {
  fn?.stop()
  await proxy?.close()
  await payments?.close()
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const checkout = (items: object[], token?: string) => fn.call({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ items }),
})

test('登入的顧客結帳：訂單是他的、金額由資料庫算、用伺服器端的金鑰扣款', async () => {
  payments.charges.length = 0
  const res = await checkout([{ product_id: 2, quantity: 2, unit_price: 1 }, { product_id: 5, quantity: 1 }], a.accessToken)
  const body = await res.text()
  assert.equal(res.status, 200, `checkout 回 ${res.status}：${body}\n容器的 log：\n${fn.logs()}`)
  const { order_id, total, charge_id } = JSON.parse(body)
  assert.equal(total, 290, '總價是 2 杯拿鐵 110＋1 個可頌 70 = 290')
  const [order] = await sql(`select customer_id, total from ${schema}.orders where id = $1`, [order_id])
  assert.deepEqual(order, { customer_id: a.id, total: 290 }, '訂單要屬於呼叫的顧客：呼叫 place_order 時帶上呼叫者的 Authorization')
  assert.deepEqual(payments.charges, [{ orderId: order_id, amount: 290 }],
    '要向金流扣一次款，金額是資料庫算出的 total（不是前端傳來的價格）。金流回 401 代表金鑰不對：從環境變數 PAYMENT_API_KEY 讀，不要寫死')
  assert.equal(charge_id, 'ch_1', 'charge_id 是金流回傳的 id')
})

test('對 Supabase 的請求用 publishable key＋呼叫者的 token，不用 secret key', async () => {
  proxy.requests.length = 0
  await checkout([{ product_id: 1, quantity: 1 }], a.accessToken)
  assert.ok(proxy.requests.length >= 1, '沒有收到 Edge Function 對 Supabase 的請求：網址用環境變數 SUPABASE_URL')
  for (const r of proxy.requests) {
    assert.notEqual(r.headers.apikey, stack().SECRET_KEY, `${r.method} ${r.path} 用了 secret key：它會繞過 RLS，place_order 也拿不到 auth.uid()。這裡要代表顧客本人，用 publishable key`)
    assert.equal(r.headers.authorization, `Bearer ${a.accessToken}`, `${r.method} ${r.path} 的 Authorization 要原樣轉交呼叫者的 token`)
  }
})

test('沒登入：回 4xx，不建訂單、不扣款', async () => {
  payments.charges.length = 0
  const [{ n: before }] = await sql(`select count(*)::int as n from ${schema}.orders`)
  const res = await checkout([{ product_id: 1, quantity: 1 }])
  assert.ok(res.status >= 400 && res.status < 500, `沒帶 token 應該回 4xx（place_order 不給 anon 執行），實際是 ${res.status}`)
  assert.deepEqual(payments.charges, [], 'place_order 失敗時不能扣款：要檢查回應的狀態碼')
  const [{ n: after }] = await sql(`select count(*)::int as n from ${schema}.orders`)
  assert.equal(after, before)
})

test('有商品不存在：回 4xx，不扣款', async () => {
  payments.charges.length = 0
  const res = await checkout([{ product_id: 999, quantity: 1 }], a.accessToken)
  assert.ok(res.status >= 400 && res.status < 500, `place_order 回錯誤時，把它的狀態碼回給呼叫者，實際是 ${res.status}`)
  assert.deepEqual(payments.charges, [], '下單失敗時不能扣款')
})
