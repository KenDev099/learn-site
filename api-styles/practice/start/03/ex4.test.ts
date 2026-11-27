import test from 'node:test'
import assert from 'node:assert/strict'
import { graphql } from 'graphql'
import { createSchema } from 'graphql-yoga'
import { predictions, type CaseName } from './nulls.ts'

const opts = { timeout: 10_000 }
const boom = () => { throw new Error('資料來源壞了') }

// 四個案例：每個都只有一個 resolver 會丟錯
const CASES: Record<CaseName, { typeDefs: string, query: string, resolvers: any }> = {
  'nullable-field': {
    typeDefs: 'type Query { order: Order }  type Order { id: ID!  note: String }',
    query: '{ order { id note } }',
    resolvers: { Query: { order: () => ({ id: '1' }) }, Order: { note: boom } },
  },
  'non-null-child': {
    typeDefs: 'type Query { order: Order }  type Order { id: ID!  customer: Customer! }  type Customer { name: String! }',
    query: '{ order { id customer { name } } }',
    resolvers: { Query: { order: () => ({ id: '1' }) }, Order: { customer: boom } },
  },
  'list-item': {
    typeDefs: 'type Query { orders: [Order]! }  type Order { id: ID!  items: [Item!]! }  type Item { name: String! }',
    query: '{ orders { id items { name } } }',
    resolvers: {
      Query: { orders: () => [{ id: '1', items: [{ name: '拿鐵' }] }, { id: '2', items: [{ name: '可頌' }, { broken: true }] }] },
      Item: { name: (item: { name?: string, broken?: boolean }) => item.broken ? boom() : item.name },
    },
  },
  'root-non-null': {
    typeDefs: 'type Query { order: Order! }  type Order { id: ID!  customer: Customer! }  type Customer { name: String! }',
    query: '{ order { id customer { name } } }',
    resolvers: { Query: { order: () => ({ id: '1', customer: {} }) }, Customer: { name: boom } },
  },
}

for (const [name, c] of Object.entries(CASES) as [CaseName, (typeof CASES)[CaseName]][]) {
  test(`案例 ${name}：預測的 data 與錯誤路徑跟實際執行相同`, opts, async () => {
    const schema = createSchema({ typeDefs: c.typeDefs, resolvers: c.resolvers })
    // graphql() 的結果是沒有原型的物件，轉成一般 JSON 再比較
    const actual = JSON.parse(JSON.stringify(await graphql({ schema, source: c.query })))
    const guess = predictions[name]
    assert.ok(guess, `nulls.ts 的 predictions 要有 '${name}'`)
    assert.deepEqual(guess.data, actual.data,
      `${name} 的 data 預測錯了。找出丟錯的欄位，看它是不是非空（!）：非空就往上一層找，直到遇到可以是 null 的位置（清單的元素也算一層），整個那一層變成 null`)
    assert.deepEqual(guess.path, actual.errors[0].path,
      `${name} 的錯誤 path 不對：path 是從根開始、到丟錯那個欄位的完整路徑，清單要寫索引（數字），例如 ['orders', 0, 'items']`)
  })
}
