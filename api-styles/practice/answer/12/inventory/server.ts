// 練習 3：庫存服務。庫存放在記憶體的 Map（商品 id → 剩幾份），由測試注入
// Reserve：全部品項都夠才扣（一項不夠就都不扣，回 FAILED_PRECONDITION ＋ OutOfStockDetail）；
//          同一個 idempotency_key 重送時不再扣，回傳第一次的結果
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService, OutOfStockDetailSchema } from '../gen/coffee/inventory/v1/inventory_pb.js'

type Level = { productId: string, available: number }

export function inventoryRoutes(stock: Map<string, number>) {
  // 做過的預留：key → 第一次的回應。只放在記憶體、永遠不過期：這是刻意的簡化，正式環境存進資料庫並設保存期限
  const done = new Map<string, { remaining: Level[] }>()
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async getStock(req) {
        if (req.productIds.length === 0) throw new ConnectError('product_ids 至少要有一個商品 id', Code.InvalidArgument)
        const levels: Record<string, Level> = {}
        for (const productId of req.productIds) {
          const available = stock.get(productId)
          if (available === undefined) throw new ConnectError(`找不到商品 ${productId}`, Code.NotFound)
          levels[productId] = { productId, available }
        }
        return { levels }
      },
      async reserve(req) {
        if (!req.idempotencyKey) throw new ConnectError('idempotency_key 不能是空的', Code.InvalidArgument)
        const previous = done.get(req.idempotencyKey)
        if (previous) return previous
        if (req.items.length === 0) throw new ConnectError('items 至少要有一項', Code.InvalidArgument)
        const wanted = new Map<string, number>()
        for (const { productId, quantity } of req.items) {
          if (quantity < 1) throw new ConnectError('quantity 至少要是 1', Code.InvalidArgument)
          if (!stock.has(productId)) throw new ConnectError(`找不到商品 ${productId}`, Code.NotFound)
          wanted.set(productId, (wanted.get(productId) ?? 0) + quantity)
        }
        // 先全部檢查、再全部扣；中間沒有 await，同一個程序裡不會有別的請求插進來
        for (const [productId, quantity] of wanted) {
          const available = stock.get(productId)!
          if (quantity > available) {
            throw new ConnectError(`庫存不足：商品 ${productId} 剩 ${available} 份，要 ${quantity} 份`, Code.FailedPrecondition, undefined,
              [{ desc: OutOfStockDetailSchema, value: { productId, available } }])
          }
        }
        const remaining: Level[] = []
        for (const [productId, quantity] of wanted) {
          stock.set(productId, stock.get(productId)! - quantity)
          remaining.push({ productId, available: stock.get(productId)! })
        }
        const res = { remaining }
        done.set(req.idempotencyKey, res)
        return res
      },
    })
  }
}
