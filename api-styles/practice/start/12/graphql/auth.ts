// 授權規則（不用改，第 6 課寫過）：resolvers.ts 的每一條路徑都要經過這些函式
import { GraphQLError } from 'graphql'
import type { OrderRow, Viewer } from './context.ts'

export const isStaff = (viewer: Viewer | null) => viewer?.role === 'STAFF'

// 這個人看得到 customerId 這位顧客的訂單嗎？本人或店員
export function canSeeOrdersOf(viewer: Viewer | null, customerId: number | string): boolean {
  if (!viewer) return false
  return viewer.role === 'STAFF' || viewer.id === String(customerId)
}

// 直接要求一張訂單：沒登入 → UNAUTHENTICATED；不是本人也不是店員 → FORBIDDEN；找不到 → null
export function requireOrder(viewer: Viewer | null, order: OrderRow | null): OrderRow | null {
  if (!viewer) throw unauthenticated()
  if (!order) return null
  if (!canSeeOrdersOf(viewer, order.customer_id)) throw forbidden()
  return order
}

// 只有店員看得到的欄位
export function staffOnly<T>(viewer: Viewer | null, value: T): T | null {
  return isStaff(viewer) ? value : null
}

export const unauthenticated = () => new GraphQLError('請先登入', { extensions: { code: 'UNAUTHENTICATED' } })
export const forbidden = () => new GraphQLError('沒有權限查看這張訂單', { extensions: { code: 'FORBIDDEN' } })
