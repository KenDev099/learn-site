// 練習 3（錯誤寫法）
import { on, type EventEmitter } from 'node:events'
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

export type StockChange = { productId: string, available: number }

export function watchRoutes(stock: Map<string, number>, changes: EventEmitter) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async *watchStock(req, ctx) {
        const current = stock.get(req.productId)
        if (current === undefined) throw new ConnectError(`找不到商品 ${req.productId}`, Code.NotFound)
        // 每 20 ms 看一次 Map，不等事件
        let last = current
        yield { productId: req.productId, available: current }
        while (!ctx.signal.aborted) {
          await new Promise(r => setTimeout(r, 20))
          const now = stock.get(req.productId)!
          if (now !== last) { last = now; yield { productId: req.productId, available: now } }
        }
        throw ctx.signal.reason
      },
    })
  }
}
void on
