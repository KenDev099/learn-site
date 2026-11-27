// outbox 裡的事件類型與內容。內容只放處理的人需要的事實，處理時就不必回頭查訂單（第 26 課）
export type OrderPaidPayload = { orderId: number; customerId: number; total: number }

export type OutboxMessage =
  | { type: 'order.paid'; payload: OrderPaidPayload }          // → loyalty 佇列：加點
  | { type: 'receipt.requested'; payload: OrderPaidPayload }   // → notifications 佇列：寄電子收據

export const LOYALTY_QUEUE = 'loyalty'
export const NOTIFICATIONS_QUEUE = 'notifications'
