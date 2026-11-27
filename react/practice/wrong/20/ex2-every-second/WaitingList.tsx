// 錯誤寫法：每秒更新一次時間，一分鐘 render 60 次
import { useEffect, useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const [now, setNow] = useState(() => Date.now())   // 初始值函式只在掛上時執行

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)   // callback 不在 render 裡
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
