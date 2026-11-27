// 課程提供（不用改）：App 的 BFF。用 schema.graphql 與 bff.ts 的 resolvers 建立 Yoga 伺服器
// 每個 GraphQL 請求的 context：deadline 是「現在 + 整個請求的預算」，之後每個下游都從這個預算裡分
import { readFileSync } from 'node:fs'
import { createSchema, createYoga } from 'graphql-yoga'
import type { Client } from '@connectrpc/connect'
import type { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { resolvers, type BffContext, type MenuSource } from './bff.ts'

export type BffOptions = {
  menu: MenuSource
  inventory: Client<typeof InventoryService>
  now?: () => number      // 測試傳入假的時鐘；正式環境就是 Date.now
  budgetMs?: number       // 這個請求最多花多久（毫秒）
}

export function buildBff({ menu, inventory, now = Date.now, budgetMs = 500 }: BffOptions) {
  return createYoga<{}, BffContext>({
    schema: createSchema<BffContext>({ typeDefs: readFileSync(new URL('./schema.graphql', import.meta.url), 'utf8'), resolvers }),
    context: ({ request }) => ({ menu, inventory, now, deadline: now() + budgetMs, signal: request.signal }),
    logging: false,
    graphiql: false,
  })
}
