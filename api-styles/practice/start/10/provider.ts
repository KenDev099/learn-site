// 菜單 API（provider，不用改）。練習 4 用它驗證契約；測試還會把 priceTwd 改名再跑一次你的驗證，確認那次會失敗
import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Product } from '../../helpers/coffee.ts'

export function createMenuApi() {
  const store = { products: [] as Product[] }   // 一開始是空的：驗證前要靠 provider state 準備資料
  const yoga = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Product { id: ID!  name: String!  priceTwd: Int! }
        type Query { menu: [Product!]! }
      `,
      resolvers: {
        Query: { menu: () => store.products },
        Product: { priceTwd: (p: Product) => p.price },
      },
    }),
    logging: false,
    graphiql: false,
  })
  return { server: createServer(yoga), store }
}
