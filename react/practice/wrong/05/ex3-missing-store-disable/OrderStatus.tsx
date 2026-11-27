// 錯誤：漏了 storeId，用 eslint-disable 蓋掉
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  useEffect(() => {
    return hub.subscribe({ storeId, orderId }, setStatus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, orderId])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
