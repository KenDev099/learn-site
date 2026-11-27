export const ORDER_STATUSES = ['pending', 'paid', 'completed', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

// 練習 3：GET /orders 的查詢參數
//   page：正整數，沒給就是 1
//   pageSize：1–100 的整數，沒給就是 20
//   status：選填，只能是 ORDER_STATUSES 之一
export class ListOrdersQuery {
  page: number
  pageSize: number
  status?: OrderStatus
}
