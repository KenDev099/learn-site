// 練習 1：訂單狀態機。這個檔案只放規則：不 import @nestjs/*、不 import Prisma，也不丟 HTTP 例外
export const ORDER_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_EVENTS = ['pay', 'prepare', 'ready', 'complete', 'cancel'] as const
export type OrderEvent = (typeof ORDER_EVENTS)[number]

export function transition(status: OrderStatus, event: OrderEvent): OrderStatus {
  throw new Error(`還沒寫：${status} 收到 ${event} 之後是什麼狀態？不允許的轉換丟 InvalidTransitionError`)
}
