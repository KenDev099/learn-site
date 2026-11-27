import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)

  useEffect(() => {
    // 物件在 effect 裡面建立：依賴陣列只剩原始值，值沒變就不會重新訂閱
    const unsubscribe = hub.subscribe({ storeId, orderId }, setStatus)
    return unsubscribe   // 依賴改變或卸載時，取消「這一次」的訂閱
  }, [hub, storeId, orderId])

  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
