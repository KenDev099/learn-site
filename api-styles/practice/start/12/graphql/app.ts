// GraphQL 伺服器的組裝（不用改）：schema ＋ resolvers ＋ 每個請求的 context ＋ protect.ts 的防護
// 這個伺服器就是 App 的 BFF（第 11 課）：資料庫的資料自己查，庫存透過 gRPC 問庫存服務
import { existsSync, readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Client } from '@connectrpc/connect'
import type { Db } from '../../../helpers/db.ts'
import type { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'
import type { Context, Logger, Viewer } from './context.ts'
import { createLoaders } from './loaders.ts'
import { resolvers } from './resolvers.ts'
import { protect } from './protect.ts'

export type AppOptions = {
  db: Db
  inventory: Client<typeof InventoryService>
  sessions: Map<string, Viewer>        // token → 登入的人（伺服器端保存的 session）
  dev?: boolean                        // 開發模式：允許任意查詢文字（GraphiQL）；正式環境是 false
  operations?: Map<string, string>     // persisted operations 白名單：sha256（hex）→ 查詢文字；預設讀 codegen 產生的檔案
  logger?: Logger
  now?: () => number
  budgetMs?: number                    // 整個請求的時間預算，預設 500 ms
}

// codegen 產生的 app/gql/persisted-documents.json：{ "sha256:<hex>": "查詢文字" }。App 送出的雜湊是 <hex>
export function loadOperations(): Map<string, string> {
  const file = new URL('../app/gql/persisted-documents.json', import.meta.url)
  if (!existsSync(file)) return new Map()
  const docs: Record<string, string> = JSON.parse(readFileSync(file, 'utf8'))
  return new Map(Object.entries(docs).map(([key, query]) => [key.replace(/^sha256:/, ''), query]))
}

// 登入：Authorization: Bearer <token>，token 對到伺服器的 session（角色也存在伺服器端）
function viewerFrom(request: Request, sessions: Map<string, Viewer>): Viewer | null {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  return (token && sessions.get(token)) || null
}

export function createApp({ db, inventory, sessions, dev = false, operations = loadOperations(), logger = console, now = Date.now, budgetMs = 500 }: AppOptions) {
  const schema = createSchema<Context>({
    typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'),
    resolvers,
  })
  return createYoga({
    schema,
    logging: false,
    graphiql: dev,
    // 每個請求一份新的 context：loader 的快取只活在這個請求裡；deadline 從收到請求的這一刻開始算
    context: ({ request }): Context => ({
      db, inventory, now, logger,
      loaders: createLoaders(db),
      viewer: viewerFrom(request, sessions),
      deadline: now() + budgetMs,
    }),
    ...protect({ dev, operations, logger }),
  })
}
