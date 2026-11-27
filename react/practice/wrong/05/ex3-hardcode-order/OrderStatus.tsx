// 錯誤：照範例把店號、訂單編號寫死
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    return hub.subscribe({ storeId: 1, orderId: 12 }, setStatus)
  }, [hub])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
