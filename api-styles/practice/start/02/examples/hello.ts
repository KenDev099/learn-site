// 第一個 GraphQL：schema 只有一個欄位，在 Node 裡直接執行查詢，不需要伺服器
import { buildSchema, graphql } from 'graphql'

const schema = buildSchema(`
  type Query {
    hello: String
  }
`)
const rootValue = { hello: () => '歡迎光臨咖啡店' }

console.log(JSON.stringify(await graphql({ schema, source: '{ hello }', rootValue })))
console.log(JSON.stringify(await graphql({ schema, source: '{ helo }', rootValue })))
