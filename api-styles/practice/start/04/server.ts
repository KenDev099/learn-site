// 把 schema.graphql 和 resolver 組成 Yoga（不用改）
// 預設用你的 resolvers.ts 和 context.ts；測試與 examples/measure.ts 會傳入 naive.ts 的 resolver 來比較
import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Db } from '../../helpers/db.ts'
import { resolvers as myResolvers } from './resolvers.ts'
import { createContext } from './context.ts'
import type { naiveResolvers } from './naive.ts'

const typeDefs = readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8')

type Options = { resolvers?: typeof myResolvers | typeof naiveResolvers, context?: () => object | Promise<object> }

export function buildYoga(db: Db, { resolvers = myResolvers, context = () => createContext(db) }: Options = {}) {
  return createYoga({ schema: createSchema({ typeDefs, resolvers }), context, logging: false })
}
