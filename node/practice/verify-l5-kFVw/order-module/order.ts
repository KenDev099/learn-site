import type { Item } from './types.ts'
import { OrderStatus, nextStatus } from './status.ts'

export class Order {
  status: OrderStatus = OrderStatus.Pending
  readonly customer: string
  private items: Item[]

  // parameter properties 改成：先宣告欄位，再在建構子裡指定
  constructor(customer: string, items: Item[]) {
    this.customer = customer
    this.items = items
  }

  total(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.qty, 0)
  }

  // 往下一個狀態走；已經取餐了就丟錯
  advance(): void {
    const n = nextStatus(this.status)
    if (n === null) throw new Error(`${this.customer} 的訂單已經取餐，不能再往下`)
    this.status = n
  }

  summary(): string {
    return `${this.customer}：${this.total()} 元（${this.status}）`
  }
}
