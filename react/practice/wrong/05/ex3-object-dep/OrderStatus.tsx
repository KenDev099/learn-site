// 錯誤：有清理，但依賴是每次 render 都新建的物件，每次 render 都重新訂閱
import { useEffect, useState } from 'react'
import type { OrderHub, OrderState } from './order-hub.ts'

export function OrderStatus({ hub, storeId, orderId }: { hub: OrderHub; storeId: number; orderId: number }) {
  const [status, setStatus] = useState<OrderState | null>(null)
  const target = { storeId, orderId }
  useEffect(() => {
    return hub.subscribe(target, setStatus)
  }, [hub, target])
  return <p>訂單 #{orderId}：{status ?? '查詢中'}</p>
}
