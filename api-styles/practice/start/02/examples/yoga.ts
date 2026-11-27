// 把 schema 變成 HTTP 端點：node examples/yoga.ts，然後用 curl 或瀏覽器打開 http://localhost:4000/graphql
// 預設用 4000 port；被占用時改用 PORT=4001 node examples/yoga.ts
import { createServer } from 'node:http'
import { createSchema, createYoga } from 'graphql-yoga'
import { menu } from '../data.ts'

const yoga = createYoga({
  schema: createSchema({
    typeDefs: /* GraphQL */ `
      type Product {
        id: ID!
        name: String!
        price: Int!
      }
      type Query {
        menu: [Product!]!
      }
    `,
    resolvers: {
      Query: {
        menu: () => menu,
      },
    },
  }),
})

const port = Number(process.env.PORT ?? 4000)
createServer(yoga).listen(port, () => console.log(`GraphQL 端點：http://localhost:${port}${yoga.graphqlEndpoint}（Ctrl+C 結束）`))
