import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { getIntrospectionQuery } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { mulberry32 } from '../../helpers/coffee.ts'
import { gql } from '../../helpers/graphql.ts'
import { createStore, type CustomerRow, type ItemRow, type OrderRow, type ProductRow } from './store.ts'
import { createLimitedYoga } from './depth.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const { store, orders } = createStore(random)
const pick = <T,>(list: T[]) => list[Math.floor(random() * list.length)]

// 這一題自己帶 resolver（不做授權，跟練習 1 無關），store.calls 記錄 resolver 讀了幾次資料
const schema = createSchema({
  typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
  resolvers: {
    Query: {
      menu: () => store.menu(),
      product: (_: unknown, a: { id: string }) => store.product(a.id),
      customer: (_: unknown, a: { id: string }) => store.customer(a.id),
      order: (_: unknown, a: { id: string }) => store.order(a.id),
    },
    Product: { orders: (p: ProductRow) => store.ordersWithProduct(p.id) },
    Customer: { orders: (c: CustomerRow) => store.ordersOfCustomer(c.id) },
    Order: { customer: (o: OrderRow) => store.customer(o.customerId), items: (o: OrderRow) => o.items },
    OrderItem: { product: (i: ItemRow) => store.product(i.productId) },
  },
})
const yoga = createLimitedYoga(schema)
const id = pick(orders).id

// 第 0 層 order → 1 customer → 2 orders → 3 items → 4 product → 5 orders → 6 id
const depth6 = [
  `{ order(id: "${id}") { customer { orders { items { product { orders { id } } } } } } }`,
  `{ menu { orders { customer { orders { customer { orders { total } } } } } } }`,
]
const depth7 = [
  `{ order(id: "${id}") { customer { orders { items { product { orders { customer { name } } } } } } } }`,
  `{ menu { orders { items { product { orders { items { product { name } } } } } } } }`,
  `{ menu { name } a: order(id: "${id}") { total } b: order(id: "${id}") { customer { orders { customer { orders { customer { orders { id } } } } } } } }`,
]

test('深度 6 的查詢照常執行', opts, async () => {
  for (const q of depth6) {
    const { body } = await gql(yoga, q)
    assert.equal(body.errors, undefined, `深度 6 的查詢不該被擋（上限是 6，不是 5）：${JSON.stringify(body.errors)}\n查詢：${q}`)
    assert.ok(body.data, '要有 data')
  }
})

test('深度 7 的查詢在執行前就被擋下：回錯誤、resolver 一次都沒被呼叫', opts, async () => {
  for (const q of depth7) {
    store.calls = 0
    const { body } = await gql(yoga, q)
    assert.ok(body.errors?.length, `深度 7 的查詢沒有被擋下（上限要設 6）：\n${q}`)
    assert.match(body.errors![0].message, /depth/i, `錯誤要是深度限制的錯誤（現在：${body.errors![0].message}）`)
    assert.equal(body.data ?? null, null, '被擋下的查詢不應該有 data')
    assert.equal(store.calls, 0, `resolver 讀了 ${store.calls} 次資料：深度要在驗證階段檢查（useDepthLimit 加進 createYoga 的 plugins），不是執行之後才檢查`)
  }
})

test('藏在 fragment 裡的深查詢也被擋下', opts, async () => {
  const q = `query Hidden { order(id: "${id}") { ...Deep } }
    fragment Deep on Order { customer { orders { ...Deeper } } }
    fragment Deeper on Order { items { product { orders { customer { name } } } } }`
  store.calls = 0
  const { body } = await gql(yoga, q)
  assert.ok(body.errors?.length, '把巢狀拆進 fragment 就繞過了深度限制：計算深度時要把 fragment 展開（用 @envelop/depth-limit，不要自己寫只看操作本身的規則）')
  assert.equal(store.calls, 0, 'resolver 不應該被呼叫')
})

test('內省查詢（GraphiQL、codegen 用的那份）不會被深度限制誤擋', opts, async () => {
  const { body } = await gql(yoga, getIntrospectionQuery())
  assert.equal(body.errors, undefined, `內省查詢被擋了：${JSON.stringify(body.errors)}`)
  assert.ok(body.data?.__schema?.types?.some((t: { name: string }) => t.name === 'Order'), '內省要拿得到型別清單')
})
