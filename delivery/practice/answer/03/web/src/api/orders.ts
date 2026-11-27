import { api } from './client.ts'

export interface OrderRequest {
  customerId: number
  items: { productId: number; quantity: number }[]
  note?: string
  pickupAt?: string   // 省略＝現點現做
}

export interface Order {
  id: number
  status: string
  total: number
  note: string | null
  orderedAt: string
  pickupAt: string | null
  items: { productId: number; quantity: number; unitPrice: number }[]
}

export function createOrder(body: OrderRequest) {
  return api<Order>('/orders', { method: 'POST', body: JSON.stringify(body) })
}

export function getOrder(id: number) {
  return api<Order>(`/orders/${id}`)
}
