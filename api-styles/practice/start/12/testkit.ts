// 測試共用的組裝（不用改）：資料庫 ＋ 庫存 gRPC 服務 ＋ GraphQL 伺服器，每個測試各自一份
import http2 from 'node:http2'
import { randomBytes } from 'node:crypto'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { createClient, type ConnectRouter, type Interceptor } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { listen } from '../../helpers/http.ts'
import { gql } from '../../helpers/graphql.ts'
import { PRODUCTS, mulberry32 } from '../../helpers/coffee.ts'
import { openDb } from './db.ts'
import { createApp } from './graphql/app.ts'
import { inventoryRoutes } from './inventory/server.ts'
import type { Viewer } from './graphql/context.ts'

export const random = mulberry32(Date.now())
export const int = (n: number) => Math.floor(random() * n)

type Options = {
  dev?: boolean
  budgetMs?: number
  stock?: Map<string, number>
  routes?: (router: ConnectRouter) => void        // 換掉庫存服務（例如永遠不回應的假服務）
  inventoryDown?: boolean                          // 庫存服務關掉
  operations?: Map<string, string>
  orders?: number
}

export async function setup(o: Options = {}) {
  const { db, pg, log } = await openDb({ orders: o.orders ?? 300, seed: 1 + int(1e6) })
  const stock = o.stock ?? new Map(PRODUCTS.map(p => [p.id, 5 + int(60)]))
  const server = await listen(http2.createServer(connectNodeAdapter({ routes: o.routes ?? inventoryRoutes(stock) })))
  if (o.inventoryDown) await server.close()
  // 記錄 BFF 送給庫存服務的每個呼叫：方法名稱與 grpc-timeout 標頭（client 設了 timeoutMs 才會有）
  const calls: { method: string, timeout: string | null }[] = []
  const record: Interceptor = next => req => {
    calls.push({ method: req.method.name, timeout: req.header.get('grpc-timeout') })
    return next(req)
  }
  const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: server.url, interceptors: [record] }))
  const sessions = new Map<string, Viewer>()
  const errors: unknown[] = []
  const clock = 1_800_000_000_000 + int(1e9)        // 假時鐘：固定不動，剩餘預算只取決於 budgetMs
  const yoga = createApp({
    db, inventory, sessions, dev: o.dev ?? true, operations: o.operations,
    logger: { error: e => { errors.push(e) } }, now: () => clock, budgetMs: o.budgetMs,
  })
  const login = (id: string, role: Viewer['role'] = 'CUSTOMER') => {
    const token = randomBytes(12).toString('hex')
    sessions.set(token, { id, role })
    return { authorization: `Bearer ${token}` }
  }
  const ask = (query: string, variables?: Record<string, unknown>, headers?: Record<string, string>) => gql(yoga, query, variables, headers)
  return { db, pg, log, stock, yoga, ask, login, calls, errors, inventoryUrl: server.url }
}
