// 把 schema.graphql 和 resolvers.ts 組成 schema，再接上 context（不用改）
import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import { resolvers } from './resolvers.ts'
import { createContext } from './context.ts'
import type { Db } from './db.ts'

export const schema = createSchema({
  typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
  resolvers,
})

// 每個請求，Yoga 都會呼叫一次 context 函式，把回傳值當成這個請求所有 resolver 的第三個參數
export function buildYoga(db: Db) {
  return createYoga({ schema, context: ({ request }) => createContext(request, db), logging: false })
}
