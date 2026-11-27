import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSchema, parse, specifiedRules, validate, type GraphQLError } from 'graphql'
import { createSchema, createYoga } from 'graphql-yoga'
import { mulberry32 } from '../../helpers/coffee.ts'
import { gql } from '../../helpers/graphql.ts'
import { costLimitRule } from './cost.ts'
import { useCostLimit } from './cost-plugin.ts'

const opts = { timeout: 10_000 }
const random = mulberry32(Date.now())
const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1))

// 這一題的 schema（跟頁面上的表格一樣）：每個清單欄位都有 first 和預設值
const typeDefs = /* GraphQL */ `
  type Query {
    menu(first: Int = 20): [Product!]!
    orders(first: Int = 10): [Order!]!
    order(id: ID!): Order
  }
  type Product { id: ID! name: String! price: Int! orders(first: Int = 10): [Order!]! }
  type Order { id: ID! total: Int! customer: Customer! items(first: Int = 5): [OrderItem!]! }
  type OrderItem { quantity: Int! product: Product! }
  type Customer { id: ID! name: String! orders(first: Int = 10): [Order!]! }
`
const schema = buildSchema(typeDefs)

// 用 max = 成本 與 max = 成本 - 1 各驗證一次：前者不能被擋、後者要被擋，而且 extensions.cost 要等於成本
function costErrors(source: string, max: number, variables?: Record<string, unknown>) {
  const errors = validate(schema, parse(source), [...specifiedRules, costLimitRule(max, variables)])
  const others = errors.filter(e => e.extensions?.code !== 'QUERY_TOO_COMPLEX')
  assert.deepEqual(others.map(e => e.message), [], '查詢本身要合法（這是測試的問題，請回報）')
  return errors.filter(e => e.extensions?.code === 'QUERY_TOO_COMPLEX')
}
function assertCost(source: string, expected: number, hint: string, variables?: Record<string, unknown>) {
  const over = costErrors(source, expected - 1, variables)
  const got = over[0]?.extensions?.cost
  assert.equal(over.length, 1, `成本應該是 ${expected}，但上限設 ${expected - 1} 時沒有被擋（你算的比較少）。${hint}\n查詢：${source}`)
  assert.equal(got, expected, `成本應該是 ${expected}，你算出 ${got}。${hint}\n查詢：${source}`)
  assert.match(over[0].message, new RegExp(String(expected)), '錯誤訊息裡要有算出來的成本')
  assert.deepEqual(costErrors(source, expected, variables).length, 0, `成本剛好等於上限 ${expected} 時不該被擋（超過才擋）`)
}

const a = int(11, 60), b = int(2, 9), k = int(30, 80)

test('欄位各 1 分；有 first 的欄位整個乘以 first，巢狀相乘', opts, () => {
  assertCost(`{ order(id: "1") { total customer { name } } }`, 1 + 1 + (1 + 1), '沒有 first 的欄位：自己 1 分＋底下的欄位')
  assertCost(`{ menu(first: ${a}) { name price } }`, a * (1 + 2), 'menu(first: a) { name price } = a × (1 + 2)：要乘上 first')
  assertCost(`{ orders(first: ${a}) { items(first: ${b}) { product { name } } } }`, a * (1 + b * (1 + (1 + 1))), '巢狀的清單要相乘')
})

test('沒寫 first 用 schema 的預設值', opts, () => {
  assertCost(`{ menu { name } orders { id } }`, 20 * 2 + 10 * 2, 'menu 的預設 first 是 20、orders 是 10（從 schema 讀，不要寫死）')
})

test('別名各算各的：同一個欄位查 k 次就是 k 倍', opts, () => {
  const q = `{ ${Array.from({ length: k }, (_, i) => `m${i}: menu(first: ${a}) { name }`).join(' ')} }`
  assertCost(q, k * a * 2, '每個 Field 節點都要算，不要用欄位名稱去重複')
})

test('fragment 與 inline fragment 要展開計算', opts, () => {
  assertCost(`query { orders(first: ${a}) { ...O } } fragment O on Order { items(first: ${b}) { product { name } } }`,
    a * (1 + b * 3), '遇到 ...O（FragmentSpread）要用 context.getFragment(名稱) 找到 fragment，再算它的 selectionSet')
  assertCost(`{ x: orders(first: ${a}) { ...O } y: orders(first: ${b}) { ...O } } fragment O on Order { total }`,
    a * 2 + b * 2, '同一個 fragment 用在兩個地方，兩個地方都要算：防止循環的集合只記「這條路徑上」展開過的 fragment（每往下一層複製一份），不要整份查詢共用一個')
  assertCost(`{ orders(first: ${a}) { ... on Order { total customer { name } } } }`, a * (1 + 1 + 2), 'inline fragment（... on Order）也要算它裡面的欄位')
  assertCost(`{ menu(first: ${a}) { __typename name } }`, a * 3, '__typename 也算 1 分')
})

test('first 用變數傳：要用這次請求的 variables 計算', opts, () => {
  const q = `query Menu($n: Int) { menu(first: $n) { name price } }`
  assertCost(q, a * 3, '變數的值不在查詢文字裡：用 getVariableValues(schema, op.variableDefinitions, variables) 取得 variableValues，再交給 listSize', { n: a })
  assertCost(q, 20 * 3, '沒傳變數時用 schema 的預設值', {})
  assertCost(`query Menu($n: Int = ${b}) { menu(first: $n) { name } }`, b * 2, '變數有自己的預設值（$n: Int = …）時用它', {})
})

test('互相引用的 fragment 不會讓規則當掉', opts, () => {
  const q = `{ orders { ...A } } fragment A on Order { customer { orders { ...B } } } fragment B on Order { customer { orders { ...A } } }`
  let errors: readonly GraphQLError[] = []
  assert.doesNotThrow(() => { errors = validate(schema, parse(q), [...specifiedRules, costLimitRule(1000)]) },
    '遇到 A → B → A 的 fragment 就無限遞迴（stack overflow）：記住這條路徑上已經展開過哪些 fragment，遇到重複的就跳過')
  assert.ok(errors.some(e => /within itself/.test(e.message)), 'graphql 自己的 NoFragmentCycles 規則仍要回報錯誤')
})

test('接上 Yoga：超過成本的查詢在執行前被擋（resolver 沒被呼叫），沒超過的照常執行', opts, async () => {
  let calls = 0
  const yoga = createYoga({
    schema: createSchema({
      typeDefs,
      resolvers: {
        Query: { menu: (_: unknown, args: { first: number }) => { calls++; return Array.from({ length: args.first }, (_, i) => ({ id: String(i + 1), name: `商品${i + 1}`, price: 80 })) } },
      },
    }),
    plugins: [useCostLimit(500)],
    logging: false,
  })
  const q = 'query Menu($n: Int) { menu(first: $n) { name } }'
  const ok = await gql(yoga, q, { n: b })
  assert.equal(ok.body.errors, undefined, `成本 ${b * 2} 不該被擋：${JSON.stringify(ok.body.errors)}`)
  assert.equal(ok.body.data?.menu?.length, b)
  calls = 0
  const big = await gql(yoga, q, { n: 1000 + a })        // 同一份查詢文字，只有變數不同
  assert.equal(big.body.errors?.[0]?.extensions?.code, 'QUERY_TOO_COMPLEX', `menu(first: ${1000 + a}) 要被擋下（現在：${JSON.stringify(big.body.errors)}）：成本要用請求的 variables 計算`)
  assert.equal(calls, 0, 'resolver 不應該被呼叫')
})
