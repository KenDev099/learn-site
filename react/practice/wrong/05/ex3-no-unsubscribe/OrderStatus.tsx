// 錯誤：依賴對了，但沒有取消訂閱
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    hub.subscribe({ storeId, orderId }, setStatus)
  }, [hub, storeId, orderId])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
