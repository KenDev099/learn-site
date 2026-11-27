// 練習 1：授權規則集中在這裡，resolvers.ts 的每條路徑都呼叫這些函式。
// 規則：
// - 訂單只有下單的顧客本人或店員（STAFF）看得到
// - 直接要求一張看不到的訂單（Query.order）：沒登入 → UNAUTHENTICATED；登入了但不是本人也不是店員 → FORBIDDEN
// - 列表（Product.orders、Customer.orders）：看不到的訂單直接濾掉，不讓整個列表失敗
// - 欄位層級：Customer.email、Order.internalNote 只有店員看得到，其他人拿到 null
// 角色一律看 viewer.role（伺服器從 session 查到的），不看客戶端送來的任何標頭
import { GraphQLError } from 'graphql'
import type { OrderRow, Viewer } from './store.ts'

// 這個人看得到這張訂單嗎？
export function canSeeOrder(viewer: Viewer | null, order: OrderRow): boolean {
  if (!viewer) return false
  if (viewer.role === 'STAFF') return true
  return viewer.id === order.customerId
}

// 從列表濾掉看不到的訂單
export function visibleOrders(viewer: Viewer | null, orders: OrderRow[]): OrderRow[] {
  return orders.filter(order => canSeeOrder(viewer, order))
}

// 直接要求一張訂單：看不到就丟錯（UNAUTHENTICATED 或 FORBIDDEN），看得到就回傳它；order 是 null（找不到）時回 null
export function requireOrder(viewer: Viewer | null, order: OrderRow | null): OrderRow | null {
  if (!viewer) throw unauthenticated()
  if (!order) return null
  if (!canSeeOrder(viewer, order)) throw forbidden()
  return order
}

// 只有店員看得到的欄位：店員拿到 value，其他人拿到 null
export function staffOnly<T>(viewer: Viewer | null, value: T): T | null {
  return viewer?.role === 'STAFF' ? value : null
}

// 給 GraphQLError 用的兩個代碼（第 5 課教過）
export const unauthenticated = () => new GraphQLError('請先登入', { extensions: { code: 'UNAUTHENTICATED' } })
export const forbidden = () => new GraphQLError('沒有權限查看這張訂單', { extensions: { code: 'FORBIDDEN' } })
