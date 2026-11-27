import { OrderResponse, type OrderRequest } from '../../../shared/contract.ts'
import { api } from './client.ts'

// 回應先過契約再交給畫面：格式不對（例如 API 改了欄位）就在這裡丟錯，不讓錯的資料流進畫面
function toOrder(body: unknown): OrderResponse {
  const result = OrderResponse.safeParse(body)
  if (!result.success) throw new Error('訂單資料的格式跟預期不同，請重新整理頁面')
  return result.data
}

export async function createOrder(body: OrderRequest) {
  return toOrder(await api<unknown>('/orders', { method: 'POST', body: JSON.stringify(body) }))
}

export async function getOrder(id: number) {
  return toOrder(await api<unknown>(`/orders/${id}`))
}
