// 在 work/11 執行：node examples/bff.ts（做完練習 1 之後；PORT 換 BFF 的 port，預設 4000）
// 同一個程序開兩個伺服器：庫存服務（gRPC，HTTP/2，系統分配 port）與 App 的 BFF（GraphQL）
// INVENTORY=down 讓庫存服務一律回 UNAVAILABLE；INVENTORY=slow 讓它卡住不回應
import http2 from 'node:http2'
import { createServer } from 'node:http'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { Code, ConnectError, createClient, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from '../gen/coffee/inventory/v1/inventory_pb.js'
import { inventoryRoutes } from '../inventory.ts'
import { buildBff } from '../server.ts'

const mode = process.env.INVENTORY ?? 'up'
const stock = new Map([['1', 12], ['2', 5], ['3', 8], ['4', 20], ['5', 0], ['6', 3]])
const routes = (router: ConnectRouter) => {
  if (mode === 'up') return inventoryRoutes(stock)(router)
  router.service(InventoryService, {
    async listStock(_req, ctx) {
      if (mode === 'slow') await new Promise(r => ctx.signal.addEventListener('abort', r))
      throw new ConnectError('inventory-db-1 連線被拒', Code.Unavailable)
    },
  })
}
const inv = http2.createServer(connectNodeAdapter({ routes })).listen(0, '127.0.0.1', () => {
  const { port } = inv.address() as { port: number }
  const inventory = createClient(InventoryService, createGrpcTransport({ baseUrl: `http://127.0.0.1:${port}` }))
  const menu = { list: async () => [
    { id: '1', name: '美式咖啡', price: 80 }, { id: '2', name: '拿鐵', price: 110 }, { id: '3', name: '卡布奇諾', price: 110 },
    { id: '4', name: '伯爵紅茶', price: 90 }, { id: '5', name: '可頌', price: 70 }, { id: '6', name: '起司蛋糕', price: 120 },
  ] }
  const bffPort = Number(process.env.PORT ?? 4000)
  createServer(buildBff({ menu, inventory, budgetMs: 300 })).listen(bffPort, () => {
    console.log(`BFF：http://localhost:${bffPort}/graphql，庫存服務：${mode}（Ctrl+C 結束）`)
  })
})
