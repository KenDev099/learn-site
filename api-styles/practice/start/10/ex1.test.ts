import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BreakingChangeType, findSchemaChanges, graphql, isEnumType, isObjectType, type GraphQLSchema } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { PRODUCTS, mulberry32, shuffle } from '../../helpers/coffee.ts'
import { resolvers, type Context, type OrderRow } from './resolvers.ts'

const opts = { timeout: 10_000 }
const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8')
// v1 沒有新欄位：resolvers.ts 裡多出來的 resolver 在這裡略過
const v1 = createSchema<Context>({ typeDefs: read('./schema-v1.graphql'), resolvers, resolverValidationOptions: { requireResolversToMatchSchema: 'ignore' } })
let next: GraphQLSchema
try {
  next = createSchema<Context>({ typeDefs: read('./evolve.graphql'), resolvers })
} catch (e) {
  throw new Error(`evolve.graphql 和 resolvers.ts 組不成 schema，照訊息修改：${(e as Error).message}`)
}

// 每次執行資料都不同：價格、順序、訂單狀態隨機
const random = mulberry32(Date.now())
const STATUSES: OrderRow['status'][] = ['preparing', 'ready', 'picked_up']
const products = shuffle(PRODUCTS, random).map(p => ({ id: p.id, name: p.name, price: p.price + Math.floor(random() * 30) }))
const orders: OrderRow[] = Array.from({ length: 5 }, (_, i) => {
  const items = shuffle(products, random).slice(0, 1 + Math.floor(random() * 3)).map(p => ({ productId: p.id, quantity: 1 + Math.floor(random() * 3) }))
  const total = items.reduce((s, it) => s + it.quantity * products.find(p => p.id === it.productId)!.price, 0)
  return { id: String(100 + i), total, status: STATUSES[Math.floor(random() * 3)], items }
})
const contextValue: Context = { products, orders }

const run = async (schema: GraphQLSchema, source: string, variableValues?: Record<string, unknown>) =>
  JSON.parse(JSON.stringify(await graphql({ schema, source, variableValues, contextValue })))

// 舊版 App 實際送出的查詢（新 schema 上線後，它們還會在使用者手機上跑好幾個月）
const OLD_OPERATIONS: [string, Record<string, unknown>?][] = [
  ['query Menu { menu { id name price } }'],
  ['query MenuPrices { menu { price } }'],
  ['query MenuNames { menu { name } }'],
  ['query Order($id: ID!) { order(id: $id) { id total status } }', { id: orders[0].id }],
  ['query OrderStatus($id: ID!) { order(id: $id) { status } }', { id: orders[1].id }],
  ['query OrderDetail($id: ID!) { order(id: $id) { id items { quantity product { id name price } } } }', { id: orders[2].id }],
  ['query Missing { order(id: "999") { id status } }'],
  ['fragment P on Product { id price } query WithFragment { menu { ...P } }'],
  ['query Both($a: ID!, $b: ID!) { a: order(id: $a) { status total } b: order(id: $b) { status } }', { a: orders[3].id, b: orders[4].id }],
  ['query Typename { menu { __typename id } order(id: "100") { __typename status } }'],
]

test('跟 v1 比，沒有任何破壞性變更（findSchemaChanges）', opts, () => {
  const breaking = new Set<string>(Object.values(BreakingChangeType))
  const found = findSchemaChanges(v1, next).filter(c => breaking.has(c.type)).map(c => c.description)
  assert.deepEqual(found, [], `這些變更會讓舊版 App 壞掉：${found.join('；')}。舊欄位要留著（名稱、型別都不變），另外新增新欄位`)
})

test('新欄位：Product.priceTwd: Int!、Order.state: OrderStatus!（PREPARING、READY、PICKED_UP）', opts, () => {
  const Product = next.getType('Product'), Order = next.getType('Order'), Status = next.getType('OrderStatus')
  assert.ok(isObjectType(Product) && isObjectType(Order), 'Product、Order 要是 type')
  assert.equal(String(Product.getFields().priceTwd?.type), 'Int!', 'Product 要有 priceTwd: Int!')
  assert.ok(isEnumType(Status), '要新增 enum OrderStatus')
  assert.deepEqual(Status.getValues().map(v => v.name).sort(), ['PICKED_UP', 'PREPARING', 'READY'], 'OrderStatus 的值是 PREPARING、READY、PICKED_UP')
  assert.equal(String(Order.getFields().state?.type), 'OrderStatus!', 'Order 要有 state: OrderStatus!')
})

test('舊欄位標成 @deprecated，reason 寫出替代的新欄位', opts, () => {
  const Product = next.getType('Product'), Order = next.getType('Order')
  assert.ok(isObjectType(Product) && isObjectType(Order))
  const price = Product.getFields().price, status = Order.getFields().status
  assert.ok(price && status, 'price、status 要留著')
  assert.match(price.deprecationReason ?? '', /priceTwd/, 'price 要加 @deprecated(reason: "…")，reason 要寫出改用 priceTwd（只寫 @deprecated 會得到預設的 "No longer supported"，前端不知道該改用什麼）')
  assert.match(status.deprecationReason ?? '', /\bstate\b/, 'status 要加 @deprecated(reason: "…")，reason 要寫出改用 state')
})

test('舊版 App 的 10 個查詢在新 schema 上都通過驗證，結果跟 v1 一模一樣', opts, async () => {
  for (const [source, vars] of OLD_OPERATIONS) {
    const before = await run(v1, source, vars), after = await run(next, source, vars)
    assert.equal(before.errors, undefined, `（測試資料的問題）v1 執行失敗：${source}`)
    assert.equal(after.errors?.[0]?.message, undefined, `舊查詢在新 schema 上出錯：${source}`)
    assert.deepEqual(after.data, before.data, `舊查詢的結果變了：${source}（舊欄位要回傳原本的值，例如 status 仍是小寫字串）`)
  }
})

test('新欄位回傳正確的值：priceTwd 等於價格、state 是大寫的 enum 值', opts, async () => {
  const res = await run(next, 'query($id: ID!) { menu { id priceTwd } order(id: $id) { status state } }', { id: orders[0].id })
  assert.equal(res.errors?.[0]?.message, undefined, `查詢新欄位出錯（${res.errors?.[0]?.message}）：resolvers.ts 要替 Product.priceTwd、Order.state 寫 resolver（資料列裡沒有這兩個屬性；enum 欄位要回傳 enum 的值）`)
  assert.deepEqual(res.data.menu, products.map(p => ({ id: p.id, priceTwd: p.price })), 'priceTwd 要回傳資料列的 price')
  assert.equal(res.data.order.state, orders[0].status.toUpperCase(), `state 要把 '${orders[0].status}' 轉成 enum 值 ${orders[0].status.toUpperCase()}`)
  assert.equal(res.data.order.status, orders[0].status, 'status 仍回傳原本的小寫字串')
})
