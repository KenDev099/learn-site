// 錯誤：SDL 寫在 server.ts 裡，沒有讀 menu.graphql（兩份契約會不同步）
import { createSchema, createYoga } from 'graphql-yoga'
import { menu, type Category } from './data.ts'

export const schema = createSchema({
  typeDefs: /* GraphQL */ `
    enum Category { COFFEE TEA FOOD }
    type Product { id: ID! name: String! price: Int! category: Category! description: String }
    type Query { menu(category: Category): [Product!]! product(id: ID!): Product }
  `,
  resolvers: {
    Query: {
      menu: (_parent: unknown, args: { category?: Category | null }) =>
        args.category ? menu.filter(p => p.category === args.category) : menu,
      product: (_parent: unknown, args: { id: string }) => menu.find(p => p.id === args.id) ?? null,
    },
  },
})

export const yoga = createYoga({ schema })
