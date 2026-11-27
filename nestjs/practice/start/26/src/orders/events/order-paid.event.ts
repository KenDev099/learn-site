// orders 的公開事件：別的模組只能從 src/orders/events/ import，不能碰 orders 的其他檔案
// 內容只放聽的人需要的事實，聽的人就不必回頭查訂單
export class OrderPaidEvent {
  constructor(
    readonly orderId: number,
    readonly customerId: number,
    readonly total: number,
    readonly paidAt: Date,
  ) {}
}

export const ORDER_PAID = 'order.paid'
