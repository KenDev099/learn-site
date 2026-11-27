// 領域事件：「訂單已付款」這件事已經發生了。名稱用過去式，內容只放聽的人需要的事實
export class OrderPaidEvent {
  constructor(
    readonly orderId: number,
    readonly customerId: number,
    readonly total: number,
    readonly paidAt: Date,
  ) {}
}

export const ORDER_PAID = 'order.paid'
