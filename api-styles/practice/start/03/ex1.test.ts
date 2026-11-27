import test from 'node:test'
import assert from 'node:assert/strict'
import { createYoga } from 'graphql-yoga'
import { gql } from '../../helpers/graphql.ts'
import { createDb } from './db.ts'
import { randomTables } from './testdata.ts'
import { schema } from './server.ts'
import type { Context } from './context.ts'

const opts = { timeout: 10_000 }

// 隨機的訂單資料；建好訂單之後商品「漲價」，total 要用下單當下的 unit_price
const { tables, int } = randomTables()
for (const p of tables.products) p.price += 10 + int(30)
const db = createDb(tables)
const yoga = createYoga<{}, Context>({ schema, context: { db, viewer: null }, logging: false })

const expectOrder = (o: (typeof tables.orders)[number]) => {
  const items = tables.order_items.filter(i => i.order_id === o.id)
  const customer = tables.customers.find(c => c.id === o.customer_id)!
  return {
    id: o.id,
    orderedAt: o.ordered_at,
    customer: { id: customer.id, name: customer.name },
    items: items.map(i => {
      const p = tables.products.find(p => p.id === i.product_id)!
      return { quantity: i.quantity, unitPrice: i.unit_price, product: { id: p.id, name: p.name, price: p.price } }
    }),
    total: items.reduce((s, i) => s + i.quantity * i.unit_price, 0),
  }
}

const TREE = 'id orderedAt customer { id name } items { quantity unitPrice product { id name price } } total'

test('orders 的每個欄位都要從 context.db 取得、算對', opts, async () => {
  const { body } = await gql(yoga, `{ orders { ${TREE} } }`)
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.map(e => `${e.path?.join('.')}：${e.message}`).join('；')}`)
  const got = body.data.orders as ReturnType<typeof expectOrder>[]
  const want = tables.orders.map(expectOrder)
  assert.equal(got.length, want.length, 'orders 要回傳 context.db 裡的全部訂單')
  for (let i = 0; i < want.length; i++) {
    const g = got[i], w = want[i]
    assert.equal(g.orderedAt, w.orderedAt, `訂單 ${w.id} 的 orderedAt 要是資料表的 ordered_at（預設 resolver 只會找 parent.orderedAt，名稱不同要自己寫 resolver）`)
    assert.deepEqual(g.customer, w.customer, `訂單 ${w.id} 的 customer 要是 context.db 裡的顧客物件（用 parent.customer_id 去查，不是回傳 id 字串，也不是 import 進來的範例資料）`)
    assert.deepEqual(g.items.map(x => x.unitPrice), w.items.map(x => x.unitPrice), `訂單 ${w.id} 的 unitPrice 要是資料表的 unit_price`)
    assert.deepEqual(g.items, w.items, `訂單 ${w.id} 的 items 要是 context.db 裡這張訂單的品項，product 用 parent.product_id 去查`)
    assert.equal(g.total, w.total, `訂單 ${w.id} 的 total 要是 Σ quantity × unit_price（下單當下的價格）＝ ${w.total}；用商品現在的價格算會是錯的（測試把商品漲價了）`)
  }
})

test('order(id) 找得到回完整的樹，找不到回 null', opts, async () => {
  const o = tables.orders[int(tables.orders.length)]
  const { body } = await gql(yoga, `query ($id: ID!) { order(id: $id) { ${TREE} } }`, { id: o.id })
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  assert.deepEqual(body.data.order, expectOrder(o), `order(id: "${o.id}") 的結果不對`)
  const missing = await gql(yoga, '{ order(id: "999999") { id total } }')
  assert.deepEqual(missing.body, { data: { order: null } }, '找不到的訂單回 null')
})
