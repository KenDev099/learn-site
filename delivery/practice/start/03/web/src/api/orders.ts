import { api } from './client.ts'

export interface OrderRequest {
  customerId: number
  items: { productId: number; quantity: number }[]
  note?: string
}

export interface Order {
  id: number
  status: string
  total: number
  note: string | null
  orderedAt: string
  items: { productId: number; quantity: number; unitPrice: number }[]
}

export function createOrder(body: OrderRequest) {
  return api<Order>('/orders', { method: 'POST', body: JSON.stringify(body) })
}

export function getOrder(id: number) {
  return api<Order>(`/orders/${id}`)
}
