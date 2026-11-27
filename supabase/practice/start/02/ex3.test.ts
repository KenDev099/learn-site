// 練習 3：placeOrder 新增訂單與品項，回傳新訂單的 id
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { clientFor, dropTaskSchema, requireStack, sql } from '../../helpers/supa.ts'
import { cafeSchema } from './cafe.ts'
import { placeOrder } from './place.ts'

const dir = import.meta.dirname
let schema: string
before(async () => {
  requireStack(['db', 'kong', 'rest'])
  schema = await cafeSchema(dir)
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
})

test('回傳新訂單的 id，訂單與品項都寫進資料庫', async () => {
  const id = await placeOrder(clientFor(schema), 2, [{ productId: 2, quantity: 2 }, { productId: 5, quantity: 1 }])
  assert.equal(typeof id, 'number', `要回傳新訂單的 id（數字），實際是 ${JSON.stringify(id)}：insert 預設不回傳資料，要接 .select('id')`)
  const [order] = await sql(`select customer_id, total from ${schema}.orders where id = $1`, [id])
  assert.deepEqual(order, { customer_id: 2, total: 290 }, '訂單的 customer_id 是傳進來的顧客，total 是 2 杯拿鐵（110）＋1 個可頌（70）= 290')
  const items = await sql(`select product_id, quantity, unit_price from ${schema}.order_items where order_id = $1 order by product_id`, [id])
  assert.deepEqual(items, [{ product_id: 2, quantity: 2, unit_price: 110 }, { product_id: 5, quantity: 1, unit_price: 70 }],
    '每個品項的 unit_price 要是資料庫裡的價格')
})

test('每次都是新的一張訂單', async () => {
  const a = await placeOrder(clientFor(schema), 1, [{ productId: 1, quantity: 1 }])
  const b = await placeOrder(clientFor(schema), 1, [{ productId: 1, quantity: 1 }])
  assert.ok(typeof a === 'number' && typeof b === 'number' && a !== b, '兩次下單要拿到兩個不同的 id')
})

test('API 回錯誤時丟出 Error（不存在的顧客）', async () => {
  await assert.rejects(placeOrder(clientFor(schema), 99999, [{ productId: 1, quantity: 1 }]),
    '顧客 99999 不存在，新增訂單會違反外鍵（23503）。supabase-js 不丟例外：每一步都要檢查 error，有就 throw')
})

test('有商品查不到時丟出 Error，而且不留下訂單', async () => {
  const [{ n: before }] = await sql(`select count(*)::int as n from ${schema}.orders`)
  await assert.rejects(placeOrder(clientFor(schema), 1, [{ productId: 1, quantity: 1 }, { productId: 99999, quantity: 1 }]),
    '商品 99999 不存在：查價格時就要發現少了一項，丟出 Error')
  const [{ n: after }] = await sql(`select count(*)::int as n from ${schema}.orders`)
  assert.equal(after, before, '先檢查商品都查得到，再新增訂單：不然會留下沒有品項的半張訂單')
})
