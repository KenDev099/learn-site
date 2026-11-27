// 錯誤：沒寫依賴陣列，每次 render 都取消再訂閱（lint 不會抱怨）
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    return hub.subscribe({ storeId, orderId }, setStatus)
  })
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
