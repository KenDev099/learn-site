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
        // 先收集，最後一次送
        const all: StockChange[] = [{ productId: req.productId, available: current }]
        try {
          for await (const [c] of on(changes, 'change', { signal: ctx.signal }) as AsyncIterableIterator<[StockChange]>) {
            if (c.productId === req.productId) all.push(c)
          }
        } catch {}
        yield* all
      },
    })
  }
}
void on
