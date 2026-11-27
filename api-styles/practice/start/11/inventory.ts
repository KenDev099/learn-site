// 課程提供（不用改）：第 9 課練習 1 的庫存服務，加上這一課的 ListStock。庫存放在記憶體的 Map（商品 id → 剩幾份）
// gen/ 由 buf generate 依 proto/ 產生（node check.mjs 每次跑測試前會重產）
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

export function inventoryRoutes(stock: Map<string, number>) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async getStock(req) {
        if (req.productIds.length === 0) throw new ConnectError('product_ids 至少要有一個商品 id', Code.InvalidArgument)
        const levels: Record<string, { productId: string, available: number }> = {}
        for (const productId of req.productIds) {
          const available = stock.get(productId)
          if (available === undefined) throw new ConnectError(`找不到商品 ${productId}`, Code.NotFound)
          levels[productId] = { productId, available }
        }
        return { levels }
      },
      async listStock() {
        const levels: Record<string, { productId: string, available: number }> = {}
        for (const [productId, available] of stock) levels[productId] = { productId, available }
        return { levels }
      },
      async reserve(req) {
        if (req.quantity < 1) throw new ConnectError('quantity 至少要是 1', Code.InvalidArgument)
        const available = stock.get(req.productId)
        if (available === undefined) throw new ConnectError(`找不到商品 ${req.productId}`, Code.NotFound)
        if (req.quantity > available) throw new ConnectError(`庫存不足：剩 ${available} 份，要 ${req.quantity} 份`, Code.FailedPrecondition)
        const remaining = available - req.quantity
        stock.set(req.productId, remaining)
        return { productId: req.productId, remaining }
      },
    })
  }
}
