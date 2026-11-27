import { useEffect, useRef, useState } from 'react'
import type { OrderAction, OrderState } from './orderReducer.ts'

export type OrderSource = { subscribe(listener: (action: OrderAction) => void): () => void }

export const STATUS_LABEL: Record<OrderState['status'], string> = {
  pending: '等待付款',
  paid: '已付款',
  preparing: '製作中',
  ready: '可以取餐了',
  completed: '已取餐',
  cancelled: '已取消',
}

// 用 ref 記住最新的 status，listener 自己判斷轉換：沒有經過 orderReducer，規則寫了第二份
export default function OrderTracker({ source }: { source: OrderSource }) {
  const [status, setStatus] = useState<OrderState['status']>('pending')
  const [reason, setReason] = useState('')
  const latest = useRef(status)

  useEffect(() => {
    return source.subscribe(action => {
      const s = latest.current
      let next = s
      if (action.type === 'paid' && s === 'pending') next = 'paid'
      if (action.type === 'started' && s === 'paid') next = 'preparing'
      if (action.type === 'finished' && s === 'preparing') next = 'ready'
      if (action.type === 'picked_up' && s === 'ready') next = 'completed'
      latest.current = next
      setStatus(next)
    })
  }, [source])

  function cancel() {
    latest.current = 'cancelled'
    setStatus('cancelled')
    setReason('顧客取消')
  }

  return (
    <section>
      <p role="status">{STATUS_LABEL[status]}</p>
      {status === 'cancelled' && <p>原因：{reason}</p>}
      <button type="button" disabled={status !== 'pending' && status !== 'paid'} onClick={cancel}>取消訂單</button>
    </section>
  )
}
