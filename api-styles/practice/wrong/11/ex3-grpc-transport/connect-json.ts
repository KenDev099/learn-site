import http from 'node:http'
import { connectNodeAdapter, createGrpcTransport } from '@connectrpc/connect-node'
import { ConnectError, createClient } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'
import { inventoryRoutes } from './inventory.ts'

export function createJsonServer(stock: Map<string, number>): http.Server {
  return http.createServer(connectNodeAdapter({ routes: inventoryRoutes(stock) }))
}

export type StockResult = { levels: Record<string, number> } | { code: string }

export async function fetchStockJson(baseUrl: string, ids: string[]): Promise<StockResult> {
  const client = createClient(InventoryService, createGrpcTransport({ baseUrl }))
  try {
    const res = await client.getStock({ productIds: ids })
    return { levels: Object.fromEntries(Object.values(res.levels).map(l => [l.productId, l.available])) }
  } catch (e) {
    return { code: String(ConnectError.from(e).code) }
  }
}
