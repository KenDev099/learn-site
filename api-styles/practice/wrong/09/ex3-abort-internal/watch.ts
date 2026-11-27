// 練習 3：server streaming。先送目前庫存，之後每次 changes 發出 'change' 事件就送一筆
import { on, type EventEmitter } from 'node:events'
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

// 庫存變動時，別的程式會呼叫 changes.emit('change', { productId, available })
export type StockChange = { productId: string, available: number }

export function watchRoutes(stock: Map<string, number>, changes: EventEmitter) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async *watchStock(req, ctx) {
        const current = stock.get(req.productId)
        if (current === undefined) throw new ConnectError(`找不到商品 ${req.productId}`, Code.NotFound)
        // 先開始監聽、再送目前的值：兩者之間發生的變動才不會漏掉
        // signal abort（client 取消、deadline 到、RPC 結束）時，on() 會自己移除監聽
        const events = on(changes, 'change', { signal: ctx.signal })
        let last = current
        yield { productId: req.productId, available: current }
        try {
          for await (const [change] of events as AsyncIterableIterator<[StockChange]>) {
            if (change.productId !== req.productId || change.available === last) continue
            last = change.available
            yield change
          }
        } catch (error) {
          // on() 被 abort 時丟的是 AbortError；改丟 signal 的原因，client 才會收到 DEADLINE_EXCEEDED 而不是 INTERNAL
          throw error
        }
      },
    })
  }
}
