// 錯誤寫法：只在掛上時讀一次時間，之後不會更新
import { useState } from 'react'

export type WaitingOrder = { id: number; customer: string; placedAt: number }

export function WaitingList({ orders }: { orders: WaitingOrder[] }) {
  const [now, setNow] = useState(() => Date.now())   // 初始值函式只在掛上時執行

  void setNow

  return (
    <ul aria-label="等候中">
      {orders.map(o => (
        <li key={o.id}>{o.customer}：已等 {Math.floor((now - o.placedAt) / 60000)} 分鐘</li>
      ))}
    </ul>
  )
}
