// 練習 3：用 createSchema 建立菜單的 schema（typeDefs 讀 menu.graphql、resolver 讀 data.ts），再用 createYoga 建立 yoga，兩個都 export
import { createSchema, createYoga } from 'graphql-yoga'

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    type Query {
      hello: String
    }
  `,
  resolvers: {
    Query: {
      hello: () => '歡迎光臨',
    },
  },
})

export const yoga = createYoga({ schema })
