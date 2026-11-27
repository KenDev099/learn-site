// 練習 1：訂單狀態機。這個檔案只放規則：不 import @nestjs/*、不 import Prisma，也不丟 HTTP 例外
import { ConflictException } from '@nestjs/common'
import { DomainError } from '../../errors/domain-errors.js'

export const ORDER_STATUSES = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const ORDER_EVENTS = ['pay', 'prepare', 'ready', 'complete', 'cancel'] as const
export type OrderEvent = (typeof ORDER_EVENTS)[number]

// 每個狀態收到哪個事件會變成什麼；沒列出來的組合就是不允許
const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderEvent, OrderStatus>>> = {
  pending: { pay: 'paid', cancel: 'cancelled' },
  paid: { prepare: 'preparing', cancel: 'cancelled' },
  preparing: { ready: 'ready' },
  ready: { complete: 'completed' },
  completed: {},
  cancelled: {},
}

export class InvalidTransitionError extends DomainError {
  readonly code = 'INVALID_TRANSITION'

  constructor(from: OrderStatus, event: OrderEvent) {
    super(`訂單是 ${from}，不能 ${event}`, { from, event })
  }
}

export function transition(status: OrderStatus, event: OrderEvent): OrderStatus {
  const next = TRANSITIONS[status][event]
  if (!next) throw new ConflictException(`訂單是 ${status}，不能 ${event}`)
  return next
}
