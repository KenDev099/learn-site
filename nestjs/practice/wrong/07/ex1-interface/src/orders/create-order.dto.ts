export class OrderItemDto {
  productId: number
  qty: number
  size: 'S' | 'M' | 'L'
}

export interface CreateOrderInput {
  customerId: number
  items: OrderItemDto[]
  note?: string
}
// 型別寫得很清楚，但執行時不存在
export type CreateOrderDto = CreateOrderInput
export const CreateOrderDto = Object
