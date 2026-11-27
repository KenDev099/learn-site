// 練習 3：庫存服務。庫存放在記憶體的 Map（商品 id → 剩幾份），由測試注入
// GetStock 與 Reserve 的檢查已經寫好：全部品項都夠才扣，一項不夠就都不扣，回 FAILED_PRECONDITION ＋ OutOfStockDetail
// ✗ Reserve 沒有冪等：同一個 idempotency_key 重送（例如上一次逾時後重試）會再扣一次
// 要做到：記住做過的 key 與第一次的回應；同一個 key 再來時不扣，直接回第一次的回應
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService, OutOfStockDetailSchema } from '../gen/coffee/inventory/v1/inventory_pb.js'

type Level = { productId: string, available: number }

export function inventoryRoutes(stock: Map<string, number>) {
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
        return { remaining }
      },
    })
  }
}
