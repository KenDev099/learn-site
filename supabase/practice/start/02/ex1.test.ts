// 練習 1：getOrderDetail 用一個請求（關聯嵌入）取回訂單、品項與商品名稱
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { clientFor, dropTaskSchema, recordingProxy, requireStack, sql } from '../../helpers/supa.ts'
import { cafeSchema } from './cafe.ts'
import { getOrderDetail } from './orders.ts'

const dir = import.meta.dirname
let schema: string
let proxy: Awaited<ReturnType<typeof recordingProxy>>
before(async () => {
  requireStack(['db', 'kong', 'rest'])
  schema = await cafeSchema(dir)
  proxy = await recordingProxy()
})
after(async () => {
  await proxy?.close()
  if (schema) await dropTaskSchema(schema)
})

const byName = (items: any[]) => [...items].sort((a, b) => a.products.name.localeCompare(b.products.name))

async function expected(id: number) {
  const [order] = await sql(`select id, total from ${schema}.orders where id = $1`, [id])
  const items = await sql(`select i.quantity, i.unit_price, json_build_object('name', p.name) as products
    from ${schema}.order_items i join ${schema}.products p on p.id = i.product_id where i.order_id = $1`, [id])
  return { ...order, order_items: byName(items) }
}

test('回傳一個物件（不是陣列）：訂單、品項與商品名稱', async () => {
  const got = await getOrderDetail(clientFor(schema), 1)
  assert.ok(got && !Array.isArray(got), '要回傳一張訂單物件，不是陣列：查一筆用 .single() 或 .maybeSingle()')
  assert.deepEqual({ ...got, order_items: byName(got.order_items ?? []) }, await expected(1),
    '第 1 張訂單：{ id, total, order_items: [{ quantity, unit_price, products: { name } }] }，欄位名稱與巢狀結構要一樣，不多不少')
})

test('只發一個請求：用關聯嵌入，不是每個品項各查一次', async () => {
  proxy.requests.length = 0
  const got = await getOrderDetail(clientFor(schema, undefined, proxy.url), 6)
  assert.deepEqual({ ...got, order_items: byName(got?.order_items ?? []) }, await expected(6), '第 6 張訂單的內容不對')
  const paths = proxy.requests.map(r => `${r.method} ${r.path}`)
  assert.equal(proxy.requests.length, 1, `要剛好 1 個請求，實際是 ${proxy.requests.length} 個：${paths.join('、')}。在 select 裡寫 order_items(…, products(…))，一次取回`)
  assert.equal(paths[0], 'GET /rest/v1/orders', '從 orders 這張表開始查，品項與商品用嵌入帶出來')
  assert.equal(proxy.requests[0].query.get('id'), 'eq.6', '用 .eq(\'id\', id) 在 API 篩選，不要抓回全部訂單再找')
})

test('找不到這張訂單時回傳 null', async () => {
  assert.equal(await getOrderDetail(clientFor(schema), 99999), null, '0 筆時要回傳 null：.single() 在 0 筆時回錯誤（PGRST116），.maybeSingle() 回 null')
})

test('API 回錯誤時丟出 Error', async () => {
  const broken = createServer((_, res) => res.writeHead(500, { 'content-type': 'application/json' }).end('{"message":"伺服器錯誤"}'))
  await new Promise<void>(res => broken.listen(0, '127.0.0.1', res))
  try {
    const url = `http://localhost:${(broken.address() as AddressInfo).port}`
    await assert.rejects(getOrderDetail(clientFor(schema, undefined, url), 1), 'supabase-js 不會丟例外，錯誤放在 error：檢查 error，有就 throw')
  } finally {
    broken.close()
  }
})
