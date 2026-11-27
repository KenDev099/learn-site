// 練習 2 答案：現在時間放進 state，掛上時用初始值函式讀一次，之後由計時器每 60 秒更新
import { useEffect, useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const [now, setNow] = useState(() => Date.now())   // 初始值函式只在掛上時執行

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
