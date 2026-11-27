import test from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32, shuffle } from '../../helpers/coffee.ts'
import { checkSchema } from './schema-check.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())

// main 分支的 schema；每個案例用 edit 改出 PR 的版本
const BASE = `
enum Category { COFFEE TEA FOOD }
enum OrderStatus { PREPARING READY PICKED_UP }
type Product { id: ID! name: String! price: Int! category: Category! description: String imageUrl: String origin: String calories: Int status: String }
type Order { id: ID! total: Int! status: String! note: String orderedAt: String! }
type Query {
  menu(category: Category): [Product!]!
  order(id: ID!): Order
  orders(first: Int): [Order!]!
}`
// 前端在用的操作（順序每次不同）。Order.total 只在 fragment 裡用到；description、imageUrl、origin、calories、note、Product.status 沒人用
const OPERATIONS = shuffle([
  'query Menu($c: Category) { menu(category: $c) { id name price category } }',
  'query Order($id: ID!) { order(id: $id) { id ...OrderSummary } } fragment OrderSummary on Order { total status }',
  'query Recent { orders(first: 5) { id orderedAt } }',
], random)

const unused = shuffle(['Product.description', 'Product.imageUrl', 'Product.origin', 'Product.calories'], random)
const drop = (sdl: string, coord: string) => {
  const [type, field] = coord.split('.')
  const re = new RegExp(`(type ${type} \\{[^}]*?) ${field}: [A-Za-z!\\[\\]]+`)
  assert.match(sdl, re, `（測試的問題）找不到 ${coord}`)
  return sdl.replace(re, '$1')
}
const check = (sdl: string) => checkSchema(BASE, sdl, OPERATIONS)
const show = (r: unknown) => JSON.stringify(r)

test('沒有改變：ok，breaking 與 unusedRemovals 都是空的', opts, () => {
  assert.deepEqual(check(BASE), { ok: true, breaking: [], unusedRemovals: [] })
})

test('移除沒人用的欄位：ok 仍是 true，列進 unusedRemovals（排序）', opts, () => {
  const [a, b] = unused
  const r = check(drop(drop(BASE, a), b))
  assert.equal(r.ok, true, `${a}、${b} 沒有任何操作在用，移除它們不該擋 PR（目前：${show(r)}）`)
  assert.deepEqual(r.breaking, [], `沒有人用的欄位不要放進 breaking（目前：${show(r.breaking)}）`)
  assert.deepEqual(r.unusedRemovals, [a, b].sort(), 'unusedRemovals 要是被移除欄位的 Type.field，排序後回傳')
})

test('移除使用中的欄位：ok 是 false，breaking 帶出 Product.price', opts, () => {
  const r = check(drop(BASE, 'Product.price'))
  assert.equal(r.ok, false, `Menu 查詢在用 Product.price，移除它要擋下（目前：${show(r)}）`)
  assert.ok(r.breaking.some(s => s.includes('Product.price')), `breaking 要有一項提到 Product.price（目前：${show(r.breaking)}）`)
  assert.deepEqual(r.unusedRemovals, [], '有人在用的欄位不是 unusedRemovals')
})

test('只在 fragment 裡用到的欄位也算使用中', opts, () => {
  const r = check(drop(BASE, 'Order.total'))
  assert.equal(r.ok, false, `Order.total 只出現在 fragment OrderSummary 裡，它也是有人在用：fragment 定義也要走訪（目前：${show(r)}）`)
  assert.ok(r.breaking.some(s => s.includes('Order.total')), `breaking 要有一項提到 Order.total（目前：${show(r.breaking)}）`)
})

test('同名欄位要看屬於哪個型別：Order.status 有人用，不代表 Product.status 有人用', opts, () => {
  const r = check(drop(BASE, 'Product.status'))
  assert.deepEqual(r, { ok: true, breaking: [], unusedRemovals: ['Product.status'] },
    `操作只在 Order 上選了 status；用 TypeInfo 記下「型別.欄位」，不要只比對欄位名稱（目前：${show(r)}）`)
})

test('改欄位型別（String! → OrderStatus!）是破壞性變更', opts, () => {
  const r = check(BASE.replace('status: String!', 'status: OrderStatus!'))
  assert.equal(r.ok, false, `改型別要擋下：用 findSchemaChanges 找出 BREAKING 類別的變更（目前：${show(r)}）`)
  assert.ok(r.breaking.some(s => s.includes('Order.status')), `breaking 要提到 Order.status（直接用變更的 description 就有）（目前：${show(r.breaking)}）`)
})

test('參數改成必填（orders(first: Int!)）是破壞性變更', opts, () => {
  const r = check(BASE.replace('orders(first: Int)', 'orders(first: Int!)'))
  assert.equal(r.ok, false, `沒傳 first 的舊查詢會失敗，要擋下（目前：${show(r)}）`)
  assert.ok(r.breaking.some(s => s.includes('Query.orders')), `breaking 要提到 Query.orders（目前：${show(r.breaking)}）`)
})

test('危險但不破壞（enum 加值、加選填參數）與安全的變更都不擋', opts, () => {
  const sdl = BASE
    .replace('PICKED_UP }', 'PICKED_UP CANCELLED }')                    // DANGEROUS：VALUE_ADDED_TO_ENUM
    .replace('order(id: ID!)', 'order(id: ID!, includeItems: Boolean)')  // DANGEROUS：OPTIONAL_ARG_ADDED
    .replace('note: String', 'note: String!')                           // SAFE：輸出欄位 nullable → 非空
    .replace('orderedAt: String!', 'orderedAt: String! pickupCode: String') // SAFE：FIELD_ADDED
  const r = check(sdl)
  assert.deepEqual(r, { ok: true, breaking: [], unusedRemovals: [] },
    `DANGEROUS 與 SAFE 的變更不擋；只看 BreakingChangeType（不要比對 SDL 文字）。目前：${show(r)}`)
})

test('混合：移除沒人用的 + 使用中的 + 新增欄位', opts, () => {
  const sdl = drop(drop(BASE, unused[2]), 'Order.orderedAt').replace('status: String!', 'status: String! statusCode: OrderStatus')
  const r = check(sdl)
  assert.equal(r.ok, false, `Recent 查詢在用 Order.orderedAt，要擋下（目前：${show(r)}）`)
  assert.equal(r.breaking.length, 1, `只有 Order.orderedAt 一項破壞性變更（目前：${show(r.breaking)}）`)
  assert.ok(r.breaking[0].includes('Order.orderedAt'), `breaking 要提到 Order.orderedAt（目前：${show(r.breaking)}）`)
  assert.deepEqual(r.unusedRemovals, [unused[2]], `${unused[2]} 沒人用，放在 unusedRemovals`)
})
