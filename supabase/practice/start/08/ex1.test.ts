// 練習 1：place_order：一個交易建好訂單與品項，價格由資料庫決定
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applySql, clientFor, createUser, deleteUsers, dropTaskSchema, requireStack, sql, type TestUser } from '../../helpers/supa.ts'
import { localize, shopSchema, waitRpc } from './harness.ts'

const dir = import.meta.dirname
let schema: string, a: TestUser
before(async () => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  schema = await shopSchema(dir)
  a = await createUser(dir, 'a')
  await applySql(schema, localize(readFileSync(join(dir, 'place_order.sql'), 'utf8'), schema))
  await waitRpc(schema, 'place_order')
})
after(async () => {
  if (schema) await dropTaskSchema(schema)
  await deleteUsers(dir)
})

const count = async () => (await sql(`select (select count(*) from ${schema}.orders)::int as orders, (select count(*) from ${schema}.order_items)::int as items`))[0]

test('登入的顧客呼叫 rpc：回傳訂單 id，訂單與品項都建好，價格用資料庫的', async () => {
  const { data: id, error } = await clientFor(schema, a).rpc('place_order', { items: [
    { product_id: 2, quantity: 2, unit_price: 1 },   // 前端被改過，想用 1 元買拿鐵
    { product_id: 5, quantity: 1 },
  ] })
  assert.equal(error, null, `rpc 失敗：${error?.message}`)
  assert.equal(typeof id, 'number', `要回傳新訂單的 id（integer），實際是 ${JSON.stringify(id)}`)
  const [order] = await sql(`select customer_id, total from ${schema}.orders where id = $1`, [id])
  assert.deepEqual(order, { customer_id: a.id, total: 290 },
    'customer_id 是呼叫的人（auth.uid()），total 是 2 杯拿鐵 110＋1 個可頌 70 = 290：價格一律從 products 讀，前端傳的 unit_price 不能用')
  const items = await sql(`select product_id, quantity, unit_price from ${schema}.order_items where order_id = $1 order by product_id`, [id])
  assert.deepEqual(items, [{ product_id: 2, quantity: 2, unit_price: 110 }, { product_id: 5, quantity: 1, unit_price: 70 }])
})

test('有商品不存在：回錯誤，而且一筆都沒留下', async () => {
  const before = await count()
  const { error } = await clientFor(schema, a).rpc('place_order', { items: [{ product_id: 1, quantity: 1 }, { product_id: 999, quantity: 1 }] })
  assert.ok(error, '商品 999 不存在，rpc 要回錯誤（raise exception）：不然顧客只付了一部分的錢')
  assert.deepEqual(await count(), before, '函式裡任何一步失敗，整個函式（同一個交易）都要回滾，不能留下半張訂單')
})

test('數量不合法：回錯誤，一筆都沒留下', async () => {
  const before = await count()
  const { error } = await clientFor(schema, a).rpc('place_order', { items: [{ product_id: 1, quantity: 1 }, { product_id: 2, quantity: 0 }] })
  assert.ok(error, '數量 0 違反 order_items 的 check 約束，rpc 要回錯誤')
  assert.deepEqual(await count(), before, '先新增的訂單也要一起回滾')
})

test('沒登入不能呼叫', async () => {
  const before = await count()
  const { error } = await clientFor(schema).rpc('place_order', { items: [{ product_id: 1, quantity: 1 }] })
  assert.ok(error, '沒登入（anon）呼叫要失敗')
  assert.deepEqual(await count(), before)
  const [{ ok }] = await sql(`select has_function_privilege('anon', $1::regprocedure, 'execute') as ok`, [`${schema}.place_order(jsonb)`])
  assert.equal(ok, false, '新函式預設 PUBLIC（所有角色）都能執行，anon 也能從 /rest/v1/rpc 呼叫：要 revoke execute … from public, anon，再 grant 給 authenticated')
})
