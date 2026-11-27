// 金流公司送來的事件（這個專案只處理 payment.succeeded）
export type PaymentEvent = {
  id: string            // 事件 id，例如 evt_1；同一個事件重送時不變
  type: string          // 例如 payment.succeeded
  data: { orderId: number }
}
