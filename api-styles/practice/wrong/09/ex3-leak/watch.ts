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
        // 自己 on，永遠不 off
        const queue: StockChange[] = []
        let wake = () => {}
        changes.on('change', (c: StockChange) => { queue.push(c); wake() })
        let last = current
        yield { productId: req.productId, available: current }
        while (!ctx.signal.aborted) {
          if (!queue.length) await new Promise<void>(r => { wake = r; ctx.signal.addEventListener('abort', () => r(), { once: true }) })
          const c = queue.shift()
          if (!c || c.productId !== req.productId || c.available === last) continue
          last = c.available
          yield c
        }
        throw ctx.signal.reason
      },
    })
  }
}
void on
