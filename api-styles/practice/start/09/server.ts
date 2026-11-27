// 練習 1：庫存服務的兩個 unary RPC。庫存放在記憶體的 Map（商品 id → 剩幾份），由測試注入
// gen/ 由 buf generate 依 proto/ 產生（node check.mjs 每次跑測試前會重產）
import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

export function inventoryRoutes(stock: Map<string, number>) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async getStock(req) {
        // req.productIds：要查的商品 id 陣列
        // 回傳 { levels: { [商品 id]: { productId, available } } }
        // 空陣列 → INVALID_ARGUMENT；任何一個 id 不存在 → NOT_FOUND
        throw new ConnectError('getStock 還沒實作', Code.Unimplemented)
      },
      async reserve(req) {
        // req.productId、req.quantity：扣掉 quantity 份，回傳 { productId, remaining }
        // quantity 小於 1 → INVALID_ARGUMENT；商品不存在 → NOT_FOUND；庫存不夠 → FAILED_PRECONDITION（庫存不能變）
        throw new ConnectError('reserve 還沒實作', Code.Unimplemented)
      },
    })
  }
}
