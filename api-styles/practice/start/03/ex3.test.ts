import test from 'node:test'
import assert from 'node:assert/strict'
import { createYoga } from 'graphql-yoga'
import { gql } from '../../helpers/graphql.ts'
import { shuffle } from '../../helpers/coffee.ts'
import { createDb } from './db.ts'
import { randomTables } from './testdata.ts'
import { schema } from './server.ts'
import type { Context } from './context.ts'

const opts = { timeout: 10_000 }
const PLACE = `mutation Place($input: PlaceOrderInput!) {
  placeOrder(input: $input) {
    __typename
    ... on OrderPlaced { order { id } }
    ... on OutOfStock { productId available }
    ... on InvalidQuantity { productId quantity }
  }
}`
type Line = { productId: string, quantity: number }

function setup() {
  const { tables, random, int } = randomTables()
  const db = createDb(tables)
  const viewer = tables.customers[int(tables.customers.length)]
  const yoga = createYoga<{}, Context>({ schema, context: { db, viewer }, logging: false })
  const [p1, p2, p3] = shuffle(tables.products, random)
  // 測試讀 db.tables（交易還原時整個換掉），不要先存起來
  const snapshot = () => JSON.stringify({ orders: db.tables.orders, items: db.tables.order_items, stock: db.tables.stock })
  return { db, viewer, yoga, p1, p2, p3, int, snapshot }
}

async function place(yoga: Parameters<typeof gql>[0], items: Line[]) {
  const { status, body } = await gql(yoga, PLACE, { input: { items } })
  assert.notEqual(status, 400, `mutation 沒通過驗證，schema 還沒有需要的型別：${body.errors?.[0]?.message}`)
  assert.equal(body.errors, undefined, `預期中的結果要用 union 的型別回傳，errors 要是空的：${body.errors?.map(e => e.message).join('；')}`)
  return body.data.placeOrder
}

test('schema 有 PlaceOrderInput、PlaceOrderResult union 與 Mutation.placeOrder', opts, () => {
  const result = schema.getType('PlaceOrderResult') as any
  assert.ok(result && typeof result.getTypes === 'function', '要有 union PlaceOrderResult')
  assert.deepEqual(result.getTypes().map(String).sort(), ['InvalidQuantity', 'OrderPlaced', 'OutOfStock'], 'PlaceOrderResult = OrderPlaced | OutOfStock | InvalidQuantity')
  const field = schema.getMutationType()?.getFields().placeOrder
  assert.ok(field, '要有 type Mutation { placeOrder(…) }')
  assert.equal(String(field.type), 'PlaceOrderResult!', 'placeOrder 回傳 PlaceOrderResult!')
  assert.equal(String(field.args.find(a => a.name === 'input')?.type), 'PlaceOrderInput!', '參數是 input: PlaceOrderInput!')
})

test('下單成功：回傳 OrderPlaced，寫入訂單與品項（下單當下的價格）、扣庫存', opts, async () => {
  const { db, viewer, yoga, p1, p2, int } = setup()
  db.tables.stock[p2.id] = 20 + int(5)
  const lines = [{ productId: p1.id, quantity: 1 + int(3) }, { productId: p2.id, quantity: 20 }]
  const before = { ...db.tables.stock }
  const result = await place(yoga, lines)
  assert.equal(result.__typename, 'OrderPlaced', `數量 1–20、庫存足夠時要回 OrderPlaced，拿到 ${result.__typename}（數量 20 也合法）`)
  const order = db.tables.orders.find(o => o.id === result.order?.id)
  assert.ok(order, 'OrderPlaced.order 要是新寫入的訂單')
  assert.equal(order.customer_id, viewer.id, '訂單的顧客是 context.viewer')
  assert.deepEqual(db.tables.order_items.filter(i => i.order_id === order.id).map(i => [i.product_id, i.quantity, i.unit_price]),
    lines.map(l => [l.productId, l.quantity, db.tables.products.find(p => p.id === l.productId)!.price]), '每一行都要寫進 order_items，unit_price 是商品目前的 price')
  for (const l of lines) assert.equal(db.tables.stock[l.productId], before[l.productId] - l.quantity, `商品 ${l.productId} 的庫存要扣 ${l.quantity}`)
})

test('數量不在 1–20：回傳 InvalidQuantity，什麼都不寫入', opts, async () => {
  const { yoga, p1, p2, snapshot } = setup()
  for (const bad of [0, 21, -1]) {
    const before = snapshot()
    const result = await place(yoga, [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: bad }])
    assert.deepEqual(result, { __typename: 'InvalidQuantity', productId: p2.id, quantity: bad }, `數量 ${bad} 要回 InvalidQuantity（productId 是出問題的那一行，數量要 1–20）`)
    assert.equal(snapshot(), before, `數量 ${bad} 被拒絕時，訂單、品項、庫存都不能變`)
  }
  const result = await place(yoga, [{ productId: p2.id, quantity: 0 }, { productId: p1.id, quantity: 21 }])
  assert.deepEqual(result, { __typename: 'InvalidQuantity', productId: p2.id, quantity: 0 }, '好幾行都有問題時，回報第一個有問題的那一行')
})

test('第二個品項庫存不足：回傳 OutOfStock，第一個品項的庫存也不能被扣', opts, async () => {
  const { db, yoga, p1, p2, int, snapshot } = setup()
  const available = int(4)
  db.tables.stock[p2.id] = available
  const before = snapshot()
  const result = await place(yoga, [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: available + 1 }])
  assert.deepEqual(result, { __typename: 'OutOfStock', productId: p2.id, available }, `庫存只有 ${available} 時要回 OutOfStock，available 是目前的庫存`)
  assert.equal(snapshot(), before, '有一行失敗時整張訂單都不能寫入：先全部檢查，全部通過才扣庫存、寫訂單')
})

test('同一個商品分成兩行：數量加起來超過庫存也是 OutOfStock', opts, async () => {
  const { db, yoga, p3, int, snapshot } = setup()
  const available = 4 + int(4)
  db.tables.stock[p3.id] = available
  const before = snapshot()
  const result = await place(yoga, [{ productId: p3.id, quantity: available - 1 }, { productId: p3.id, quantity: 2 }])
  assert.deepEqual(result, { __typename: 'OutOfStock', productId: p3.id, available }, `兩行合計 ${available + 1} 杯、庫存 ${available}：要回 OutOfStock`)
  assert.equal(snapshot(), before, '失敗時什麼都不能改')
})

test('兩個人同時搶最後的庫存：一個成功、一個 OutOfStock（檢查與寫入要在同一個 db.transaction 裡）', opts, async () => {
  const { db, yoga, p1, int } = setup()
  const available = 1 + int(5)
  db.tables.stock[p1.id] = available
  // 第一個請求查庫存時先停住，等第二個請求也來查（或在排隊等交易）才放行
  let calls = 0, txCalls = 0, release!: () => void
  const gate = new Promise<void>(r => { release = r })
  const timer = setTimeout(release, 3000)
  const stockOf = db.stockOf, transaction = db.transaction
  db.stockOf = async (id: string) => {
    if (++calls === 1) await gate
    else release()
    return stockOf(id)
  }
  db.transaction = ((fn: any) => { if (++txCalls >= 2 || calls >= 1) release(); return transaction(fn) }) as typeof db.transaction
  const both = await Promise.all([1, 2].map(() => place(yoga, [{ productId: p1.id, quantity: available }])))
  clearTimeout(timer)
  assert.deepEqual(both.map(r => r.__typename).sort(), ['OrderPlaced', 'OutOfStock'],
    '同時下單時兩個都看到「還有庫存」就會超賣：把「檢查庫存」到「寫入」整段放進 db.transaction(async tx => …)，用 tx 查詢與寫入')
  assert.equal(db.tables.stock[p1.id], 0, '庫存剛好賣完，是 0')
})

test('沒登入不能下單：回傳錯誤，不寫入', opts, async () => {
  const { db, p1, snapshot } = setup()
  const yoga = createYoga<{}, Context>({ schema, context: { db, viewer: null }, logging: false })
  const before = snapshot()
  const { body } = await gql(yoga, PLACE, { input: { items: [{ productId: p1.id, quantity: 1 }] } })
  assert.ok(body.errors?.length, 'context.viewer 是 null 時要丟錯（這不是商業上的預期結果，是請求本身不合法）')
  assert.notEqual(body.errors[0].message, 'Unexpected error.',
    '錯誤被遮罩成 Unexpected error.：這是讀 null.id 之類的非預期錯誤。在 resolver 先檢查 ctx.viewer，用 graphql 的 GraphQLError 丟出說明「請先登入」的訊息')
  assert.equal(snapshot(), before, '沒登入時什麼都不能改')
})
