import type { OrderRequest, OrderResponse } from '../../../shared/contract.ts'
import { api } from './client.ts'

// 只用型別斷言：TypeScript 相信它，執行時什麼都沒檢查
export function createOrder(body: OrderRequest) {
  return api<OrderResponse>('/orders', { method: 'POST', body: JSON.stringify(body) })
}

export function getOrder(id: number) {
  return api<OrderResponse>(`/orders/${id}`)
}
