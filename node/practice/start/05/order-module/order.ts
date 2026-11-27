import { Item } from './types'
import { OrderStatus, nextStatus } from './status'

export class Order {
  status: OrderStatus = OrderStatus.Pending

  constructor(public readonly customer: string, private items: Item[]) {}

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
