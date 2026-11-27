import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import { menu, type Category } from './data.ts'

// schema 在程式啟動時建一次，不是每個請求都建
const items = [...menu]   // 錯誤：啟動時複製一份，之後 data.ts 的變動看不到
export const schema = createSchema({
  typeDefs: readFileSync(new URL('./menu.graphql', import.meta.url), 'utf8'),
  resolvers: {
    Query: {
      menu: (_parent: unknown, args: { category?: Category | null }) =>
        args.category ? items.filter(p => p.category === args.category) : items,
      product: (_parent: unknown, args: { id: string }) => items.find(p => p.id === args.id) ?? null,
    },
  },
})

export const yoga = createYoga({ schema })
