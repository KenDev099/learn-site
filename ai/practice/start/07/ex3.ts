// 練習 3：有副作用的工具只「提出申請」，身分由程式決定，不由模型決定
import * as z from 'zod'
import type { Order } from '../../helpers/coffee.ts'
import type { ToolSet } from './tools.ts'

// ---- 已經寫好，不用改：店裡的訂單與待確認的動作 ----
// received：剛收到，還沒開始做（可以取消）　preparing：製作中　ready：可以取餐　done：已取餐　cancelled：已取消
export type OrderStatus = 'received' | 'preparing' | 'ready' | 'done' | 'cancelled'
export type StoreOrder = Order & { status: OrderStatus }

export class FakeDb {
  #orders: StoreOrder[]
  constructor(orders: StoreOrder[]) { this.#orders = structuredClone(orders) }
  // 回傳副本：改回傳值不會改到資料庫
  findOrder(id: number): StoreOrder | null {
    const o = this.#orders.find(o => o.id === id)
    return o ? structuredClone(o) : null
  }
  listOrders(customerId: number): StoreOrder[] {
    return structuredClone(this.#orders.filter(o => o.customerId === customerId))
  }
  setStatus(id: number, status: OrderStatus): void {
    const o = this.#orders.find(o => o.id === id)
    if (o) o.status = status
  }
}

// 待店員確認的動作。key 是冪等鍵：同一件事只能有一筆
export type PendingAction = { key: string; type: 'cancel'; orderId: number; customerId: number }
export class PendingActions {
  #items: PendingAction[] = []
  has(key: string): boolean { return this.#items.some(a => a.key === key) }
  add(action: PendingAction): void { this.#items.push({ ...action }) }
  list(): PendingAction[] { return this.#items.map(a => ({ ...a })) }
}
// ---- 已經寫好的部分到這裡 ----

// 用 zod 寫 request_cancel 的 input 驗證（第 6 課）

// customerId 是目前登入的顧客（來自 session），不是模型給的
// get_my_orders：不需要參數，回傳這位顧客的訂單 [{ id, orderedAt, total, status }]
// request_cancel({ order_id })：
//   input 用 zod 驗證，不合法就丟錯
//   訂單不存在或不是這位顧客的：丟錯，訊息一律「找不到這張訂單」（不透露別人的訂單存在）
//   狀態不是 received：丟錯，說明已經在製作、不能取消
//   pending 已經有 cancel:<order_id>：不再新增，回傳「已經申請過」的說明
//   否則加入 pending（key `cancel:${order_id}`），回傳說明「已送出申請，等店員確認」
//   任何情況都不能直接改訂單狀態
// 兩個工具都 strict: true；input_schema 不能有 customer_id
export function makeOrderTools(customerId: number, db: FakeDb, pending: PendingActions): ToolSet {
  throw new Error('TODO')
}
