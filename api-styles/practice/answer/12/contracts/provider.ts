// 練習 4：Pact provider 驗證（GraphQL 伺服器這一方）。run.ts 用 node --test contracts/provider.ts 執行
// 開一個真的 GraphQL 伺服器（正式模式、真的資料庫），讓 Pact 把 pact 檔裡的每個請求重播一次，比對回應
import test from 'node:test'
import http from 'node:http'
import { createClient } from '@connectrpc/connect'
import { createGrpcTransport } from '@connectrpc/connect-node'
import { Verifier } from '@pact-foundation/pact'
import { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'
import { listen } from '../../../helpers/http.ts'
import { openDb } from '../db.ts'
import { createApp } from '../graphql/app.ts'
import type { Viewer } from '../graphql/context.ts'

test('GraphQL 伺服器符合 App 的契約', { timeout: 30_000 }, async () => {
  const { db } = await openDb()
  const sessions = new Map<string, Viewer>()
  // OrderHistory 用不到庫存服務：給一個連不上的 client 就好
  const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: 'http://127.0.0.1:9' }))
  const { url } = await listen(http.createServer(createApp({ db, inventory, sessions, dev: false })))
  await new Verifier({
    provider: 'coffee-graphql',
    providerBaseUrl: url,
    pactUrls: [new URL('./pacts/coffee-app-coffee-graphql.json', import.meta.url).pathname],
    // provider state：pact 檔裡 given(...) 的前提，在重播請求前由 provider 準備好
    stateHandlers: {
      '顧客 1 已登入且有訂單': async () => { sessions.set('pact-customer-1', { id: '1', role: 'CUSTOMER' }) },
    },
    logLevel: 'error',
  }).verifyProvider()
})
