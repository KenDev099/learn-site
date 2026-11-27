// 練習 1：App 菜單頁的 BFF resolver。菜單一定要有；庫存是附加資訊，拿不到時菜單照常顯示
import { GraphQLError } from 'graphql'
import type { Client } from '@connectrpc/connect'
import type { InventoryService } from './gen/coffee/inventory/v1/inventory_pb.js'

export type MenuProduct = { id: string, name: string, price: number }
// 菜單服務：收到的 signal abort 時會放棄查詢
export type MenuSource = { list(signal: AbortSignal): Promise<MenuProduct[]> }

export type BffContext = {
  menu: MenuSource
  inventory: Client<typeof InventoryService>   // 庫存服務的 gRPC client（第 9 課）
  deadline: number                              // 整個請求必須在這個時間點（毫秒）之前完成
  now: () => number                             // 現在幾點：一律用它，不要用 Date.now()
  signal: AbortSignal                           // 客戶端斷線時 abort
}

// 呼叫下游時留給自己的時間（毫秒）：組回應、回傳給客戶端。剩餘預算扣掉它就是下游的 timeoutMs
export const MIN_BUDGET_MS = 20

// 庫存拿不到時，每個商品的 available 改放這個錯誤（訊息給前端看，不寫內部細節）
export function inventoryUnavailable() {
  return new GraphQLError('庫存資訊暫時無法取得', { extensions: { code: 'INVENTORY_UNAVAILABLE' } })
}

// 一個商品在 resolver 之間傳遞的形狀：available 是數字，或是拿不到庫存的錯誤
export type MenuRow = MenuProduct & { available: number | null | GraphQLError }

export const resolvers = {
  Query: {
    async menuWithStock(_parent: unknown, _args: unknown, ctx: BffContext): Promise<MenuRow[]> {
      // 剩餘預算扣掉留給自己的時間，就是庫存服務的 timeoutMs。<= 0 時不呼叫：timeoutMs 0 或負數在 Connect 代表「不設逾時」
      const timeoutMs = ctx.deadline - ctx.now() - MIN_BUDGET_MS
      const stockCall = timeoutMs > 0
        ? ctx.inventory.listStock({}, { timeoutMs, signal: ctx.signal })
        : Promise.reject(new Error(`剩餘預算不夠（${timeoutMs + MIN_BUDGET_MS} ms），不呼叫庫存服務`))
      // 兩個下游同時出發；allSettled 等兩個都結束，任一個失敗也不會讓另一個的結果丟掉
      const [menu, stock] = await Promise.allSettled([ctx.menu.list(ctx.signal), stockCall])
      if (menu.status === 'rejected') throw menu.reason   // 菜單是必要的：拿不到就整個失敗
      if (stock.status === 'rejected') {
        console.error('庫存服務呼叫失敗：', String(stock.reason))   // 細節寫進 log，不給前端
        return menu.value.map(p => ({ ...p, available: new GraphQLError(`庫存服務錯誤：${String(stock.reason)}`, { extensions: { code: 'INVENTORY_UNAVAILABLE' } }) }))
      }
      return menu.value.map(p => ({ ...p, available: stock.value.levels[p.id]?.available ?? null }))
    },
  },
  MenuItem: {
    // 課程寫好：available 是錯誤就丟出來。GraphQL 會把這個欄位設成 null，並在 errors 記下路徑
    available(row: MenuRow) {
      if (row.available instanceof GraphQLError) throw row.available
      return row.available
    },
  },
}
