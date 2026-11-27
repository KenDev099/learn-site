// 在 work/12 執行 node examples/serve.ts：庫存 gRPC 服務開在 4001，GraphQL（開發模式，可以用 GraphiQL）開在 4000（PORT 可以改）
// 用 Ctrl+C 結束。資料庫在記憶體裡，關掉就消失
import http from 'node:http'
import http2 from 'node:http2'
import { createClient } from '@connectrpc/connect'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'
import { PRODUCTS } from '../../../helpers/coffee.ts'
import { openDb } from '../db.ts'
import { createApp } from '../graphql/app.ts'
import { inventoryRoutes } from '../inventory/server.ts'
import type { Viewer } from '../graphql/context.ts'

const port = Number(process.env.PORT ?? 4000)
const { db, log } = await openDb()
const stock = new Map(PRODUCTS.map(p => [p.id, 20]))
http2.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) })).listen(port + 1, '127.0.0.1')
const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: `http://localhost:${port + 1}` }))
const sessions = new Map<string, Viewer>([['wang', { id: '1', role: 'CUSTOMER' }], ['staff', { id: 'staff-1', role: 'STAFF' }]])
const yoga = createApp({ db, inventory, sessions, dev: true })
http.createServer((req, res) => {
  log.length = 0
  res.on('finish', () => { if (log.length) console.log(`${req.method} ${req.url} → ${log.length} 句 SQL`) })
  return yoga(req, res)
}).listen(port, () => {
  console.log(`GraphQL：http://localhost:${port}/graphql（瀏覽器打開就是 GraphiQL）`)
  console.log(`登入：Authorization: Bearer wang（王小明）或 Bearer staff（店員）`)
})
