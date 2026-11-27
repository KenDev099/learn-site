// 錯誤寫法：useState(Date.now()) 每次 render 都會呼叫 Date.now()，只是結果被丟掉
import { useEffect, useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const [now, setNow] = useState(Date.now())   // 初始值函式只在掛上時執行

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)   // callback 不在 render 裡
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
