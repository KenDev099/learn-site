// 練習 2：把 deadline 與取消一路傳下去
import { Code, ConnectError, type Client, type ConnectRouter } from '@connectrpc/connect'
import { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

// 下游：真實世界裡是資料庫查詢或另一個服務。收到的 signal abort 時，它會放棄查詢並以 signal.reason 失敗
export type StockRepo = {
  fetchLevels(ids: string[], signal: AbortSignal): Promise<Map<string, number>>
}

// 剩餘時間少於這個數字（毫秒）就不值得開始查了
export const MIN_BUDGET_MS = 20

export function deadlineRoutes(repo: StockRepo) {
  return (router: ConnectRouter) => {
    router.service(InventoryService, {
      async getStock(req, ctx) {
        const left = ctx.timeoutMs()
        if (left !== undefined && left < MIN_BUDGET_MS) {
          throw new ConnectError(`剩 ${left} ms，來不及查庫存`, Code.DeadlineExceeded)
        }
        const found = await repo.fetchLevels(req.productIds, AbortSignal.timeout(1000))
        const levels: Record<string, { productId: string, available: number }> = {}
        for (const [productId, available] of found) levels[productId] = { productId, available }
        return { levels }
      },
    })
  }
}

// client 端：整個呼叫最多等 budgetMs 毫秒
export function getStockWithin(client: Client<typeof InventoryService>, ids: string[], budgetMs: number) {
  return client.getStock({ productIds: ids }, { timeoutMs: budgetMs })
}
