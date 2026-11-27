// 錯誤寫法：每一列各自開一個計時器
import { useEffect, useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

function Row({ order }: { order: WaitingOrder }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  return <li>{order.customer}：已等 {Math.floor((now - order.placedAt) / 60000)} 分鐘</li>
}

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  return (
    <ul aria-label="等候中">
      {orders.map(o => <Row key={o.id} order={o} />)}
    </ul>
  )
}
