// 錯誤：當成 onMounted／onUnmounted，只訂閱第一張訂單
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    return hub.subscribe({ storeId, orderId }, setStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
