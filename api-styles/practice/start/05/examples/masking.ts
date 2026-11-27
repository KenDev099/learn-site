// Yoga 預設的錯誤遮罩：一般的 Error 對外變成 Unexpected error.，GraphQLError 原樣保留。在 work/05 執行 node examples/masking.ts
import { GraphQLError } from 'graphql'
import { createSchema, createYoga } from 'graphql-yoga'

const yoga = createYoga({
  logging: false,
  schema: createSchema({
    typeDefs: 'type Query { menu: [String!]! salesReport: Int myOrders: [String!] }',
    resolvers: {
      Query: {
        menu: () => ['美式咖啡', '拿鐵'],
        // 資料庫丟出來的錯誤（模擬）：訊息裡有表名與欄位名
        salesReport: () => { throw new Error('column "total" does not exist (SELECT sum(total) FROM orders)') },
        // 刻意給客戶端看的錯誤
        myOrders: () => { throw new GraphQLError('請先登入', { extensions: { code: 'UNAUTHENTICATED' } }) },
      },
    },
  }),
})

const res = await yoga.fetch('http://yoga/graphql', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ query: '{ menu salesReport myOrders }' }),
})
console.log(res.status, JSON.stringify(await res.json(), null, 2))
