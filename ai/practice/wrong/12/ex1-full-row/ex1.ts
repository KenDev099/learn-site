// 練習 1：最小權限的查訂單工具：身分來自 session、只回傳需要的欄位、錯誤訊息不洩漏資料是否存在
import * as z from 'zod'
import { MENU } from '../../helpers/coffee.ts'
import type { Order } from '../../helpers/coffee.ts'
import type { ToolSet } from './tools.ts'

// ---- 已經寫好，不用改：店裡的資料庫 ----
export type OrderStatus = 'received' | 'preparing' | 'ready' | 'done' | 'cancelled'
// 資料庫的一列：跟真的 SELECT * … JOIN customers 一樣，什麼都有，包括顧客的電話、Email 與付款卡號
export type OrderRow = Order & {
  status: OrderStatus
  customer: { name: string; phone: string; email: string }
  payment: { cardNumber: string; cardHolder: string }
}
export class FakeDb {
  #rows: OrderRow[]
  constructor(rows: OrderRow[]) { this.#rows = structuredClone(rows) }
  // 回傳副本：改回傳值不會改到資料庫
  findOrder(id: number): OrderRow | null {
    const row = this.#rows.find(r => r.id === id)
    return row ? structuredClone(row) : null
  }
  listOrders(customerId: number): OrderRow[] {
    return structuredClone(this.#rows.filter(r => r.customerId === customerId))
  }
}
export type Session = { customerId: number }
// 交給模型的訂單：只有回答顧客需要的欄位
export type OrderView = { id: number; status: OrderStatus; total: number; items: Array<{ name: string; quantity: number }> }
// 商品 id → 名稱（MENU 來自 helpers/coffee.ts）
export const productName = (id: number): string => MENU.find(m => m.id === id)?.name ?? `商品 ${id}`
// ---- 已經寫好的部分到這裡 ----

// 寫一個 toView(row)：從 OrderRow 挑出 OrderView 的欄位（品項用 productName 換成名稱）
// makeSupportTools 回傳兩個 strict: true 的工具：
//   get_my_orders（沒有參數）：回傳 session.customerId 的全部訂單，每筆是 OrderView
//   get_order({ order_id })：用 zod 驗證 input（order_id 是正整數）；
//     訂單不存在、或不是 session.customerId 的：丟出 Error('找不到這張訂單')（兩種情況訊息完全一樣）
//     否則回傳那筆的 OrderView
//   input_schema 不能有任何顧客 id；handler 也不能讀 input 裡的 customer_id
const OrderInput = z.object({ order_id: z.number().int().positive() })

function toView(row: OrderRow): OrderView {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    items: row.items.map(i => ({ name: productName(i.productId), quantity: i.quantity })),
  }
}

export function makeSupportTools(session: Session, db: FakeDb): ToolSet {
  return {
    definitions: [
      {
        name: 'get_my_orders',
        description: '列出目前登入的這位顧客自己的訂單（編號、狀態、金額、品項）。顧客問「我的訂單」時使用。',
        input_schema: { type: 'object', properties: {}, additionalProperties: false },
        strict: true,
      },
      {
        name: 'get_order',
        description: '查詢目前這位顧客自己的一張訂單（狀態、金額、品項）。顧客提到某個訂單編號時使用。',
        input_schema: {
          type: 'object',
          properties: { order_id: { type: 'integer', description: '訂單編號' } },
          required: ['order_id'],
          additionalProperties: false,
        },
        strict: true,
      },
    ],
    handlers: {
      get_my_orders: () => db.listOrders(session.customerId),
      get_order: input => {
        const { order_id } = OrderInput.parse(input)
        const row = db.findOrder(order_id)
        if (!row || row.customerId !== session.customerId) throw new Error('找不到這張訂單')
        return row
      },
    },
  }
}
