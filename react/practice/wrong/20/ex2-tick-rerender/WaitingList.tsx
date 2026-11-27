// 錯誤寫法：計時器只負責觸發重新 render，時間還是在 render 裡讀
import { useEffect, useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const [, setTick] = useState(0)
  const now = Date.now()

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)   // callback 不在 render 裡
    return () => clearInterval(id)
  }, [])

  return (
    <ul aria-label="等候中">
      {orders.map(o => (
        <li key={o.id}>{o.customer}：已等 {Math.floor((now - o.placedAt) / 60000)} 分鐘</li>
      ))}
    </ul>
  )
}
