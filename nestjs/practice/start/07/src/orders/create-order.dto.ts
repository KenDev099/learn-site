// 練習 1：加上 class-validator 的規則
//   customerId：正整數
//   items：1–20 筆，每一筆是 OrderItemDto
//   note：選填，最多 50 字
export class OrderItemDto {
  productId: number   // 正整數
  qty: number         // 1–10 的整數
  size: 'S' | 'M' | 'L'
}

export class CreateOrderDto {
  customerId: number
  items: OrderItemDto[]
  note?: string
}
