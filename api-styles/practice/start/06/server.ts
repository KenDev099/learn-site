// 練習 1 的伺服器（不用改）：schema.graphql ＋ resolvers.ts，context 帶著 store 和目前登入的人
import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import { resolvers, type Context } from './resolvers.ts'
import type { Store, Viewer } from './store.ts'

// 登入狀態：Authorization: Bearer <token>，token 對到伺服器自己保存的 session（角色也存在伺服器端）。
// 客戶端只能證明「我是誰」，不能自己宣告「我是店員」
export function viewerFrom(request: Request, sessions: Map<string, Viewer>): Viewer | null {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  return (token && sessions.get(token)) || null
}

export function buildYoga(store: Store, sessions: Map<string, Viewer>) {
  const schema = createSchema<Context>({
    typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
    resolvers,
  })
  return createYoga({
    schema,
    context: ({ request }) => ({ store, viewer: viewerFrom(request, sessions) }),
    logging: false,
  })
}
