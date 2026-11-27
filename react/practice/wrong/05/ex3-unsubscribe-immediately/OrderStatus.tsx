// 錯誤：return unsubscribe() 是當場取消，不是回傳清理函式
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    const unsubscribe = hub.subscribe({ storeId, orderId }, setStatus)
    return unsubscribe()
  }, [hub, storeId, orderId])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
