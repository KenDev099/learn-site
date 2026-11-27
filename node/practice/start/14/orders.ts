// 咖啡店的訂單：型別、狀態機、驗證、記憶體裡的 store（不用改這個檔案）
import { setTimeout as sleep } from 'node:timers/promises'
import type { FieldError } from './problem.ts'

export const DRINKS = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶'] as const
export const STATUSES = ['pending', 'brewing', 'ready', 'picked_up', 'cancelled'] as const
export type Status = (typeof STATUSES)[number]
export type Order = { id: number, drink: string, qty: number, status: Status, createdAt: string }
export type NewOrder = { drink: string, qty: number }

// 狀態機（TypeScript 課第 27 課的寫法）：每個狀態可以變成哪些狀態
export const TRANSITIONS = {
  pending: ['brewing', 'cancelled'],
  brewing: ['ready'],
  ready: ['picked_up'],
  picked_up: [],
  cancelled: [],
} as const satisfies Record<Status, readonly Status[]>

export function isStatus(x: unknown): x is Status {
  return STATUSES.some(s => s === x)
}

export function canTransition(from: Status, to: Status): boolean {
  const next: readonly Status[] = TRANSITIONS[from]
  return next.includes(to)
}

// 驗證建立訂單的 body（第 13 課做過）：一次列出所有錯誤
export function validateNewOrder(data: unknown): { ok: true, value: NewOrder } | { ok: false, errors: FieldError[] } {
  const input = typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {}
  const errors: FieldError[] = []
  const { drink, qty } = input
  if (typeof drink !== 'string' || !DRINKS.some(d => d === drink)) errors.push({ field: 'drink', message: `drink 要是 ${DRINKS.join('、')} 其中之一` })
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 20) errors.push({ field: 'qty', message: 'qty 要是 1 到 20 的整數' })
  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { drink: drink as string, qty: qty as number } }
}

// 記憶體裡的訂單 store。now 讓測試控制時間；delayMs 模擬寫入資料庫要花的時間
export class OrderStore {
  #orders = new Map<number, Order>()
  #nextId = 1
  #now: () => Date
  #delayMs: number

  constructor({ now = () => new Date(), delayMs = 0 }: { now?: () => Date, delayMs?: number } = {}) {
    this.#now = now
    this.#delayMs = delayMs
  }

  async create(input: NewOrder): Promise<Order> {
    const createdAt = this.#now().toISOString()
    if (this.#delayMs) await sleep(this.#delayMs)
    const order: Order = { id: this.#nextId++, drink: input.drink, qty: input.qty, status: 'pending', createdAt }
    this.#orders.set(order.id, order)
    return { ...order }
  }

  get(id: number): Order | undefined {
    const order = this.#orders.get(id)
    return order && { ...order }
  }

  // 所有訂單的複本，依 id 由小到大
  all(): Order[] {
    return [...this.#orders.values()].map(o => ({ ...o }))
  }

  setStatus(id: number, status: Status): Order | undefined {
    const order = this.#orders.get(id)
    if (!order) return undefined
    order.status = status
    return { ...order }
  }
}
