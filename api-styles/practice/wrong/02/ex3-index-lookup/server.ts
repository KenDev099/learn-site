import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import { menu, type Category } from './data.ts'

// schema 在程式啟動時建一次，不是每個請求都建
export const schema = createSchema({
  typeDefs: readFileSync(new URL('./menu.graphql', import.meta.url), 'utf8'),
  resolvers: {
    Query: {
      menu: (_parent: unknown, args: { category?: Category | null }) =>
        args.category ? menu.filter(p => p.category === args.category) : menu,
      product: (_parent: unknown, args: { id: string }) => menu[Number(args.id) - 1] ?? null,
    },
  },
})

export const yoga = createYoga({ schema })
