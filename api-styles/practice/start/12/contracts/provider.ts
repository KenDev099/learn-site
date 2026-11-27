// 練習 4：Pact provider 驗證（GraphQL 伺服器這一方）。run.ts 用 node --test contracts/provider.ts 執行
// 要做到：
// - 開一個真的 GraphQL 伺服器：openDb() 的資料庫、createApp({ …, dev: false })（正式模式，跟上線一樣）、
//   http.createServer(yoga) 交給 helpers/http.ts 的 listen
// - new Verifier({ provider: 'coffee-graphql', providerBaseUrl, pactUrls: [contracts/pacts/coffee-app-coffee-graphql.json 的絕對路徑], stateHandlers }).verifyProvider()
// - stateHandlers['顧客 1 已登入且有訂單']：把 token pact-customer-1 登記成顧客 1 的 session
// OrderHistory 用不到庫存服務：inventory 給一個連不上的 client 就好
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

void http; void Verifier; void listen; void openDb; void createApp
const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: 'http://127.0.0.1:9' }))
const sessions = new Map<string, Viewer>()
void inventory; void sessions

test('GraphQL 伺服器符合 App 的契約', { timeout: 30_000 }, async () => {
})
