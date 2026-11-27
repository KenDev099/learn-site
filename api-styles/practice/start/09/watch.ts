// 練習 3：server streaming。先送目前庫存，之後每次 changes 發出 'change' 事件就送一筆
import type { EventEmitter } from 'node:events'
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

// 庫存變動時，別的程式會呼叫 changes.emit('change', { productId, available })
export type StockChange = { productId: string, available: number }

export function watchRoutes(stock: Map<string, number>, changes: EventEmitter) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async *watchStock(req, ctx) {
        // 回應的形狀：{ productId, available }
        throw new ConnectError('watchStock 還沒實作', Code.Unimplemented)
      },
    })
  }
}
