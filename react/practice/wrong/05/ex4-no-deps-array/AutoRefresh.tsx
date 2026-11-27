// 錯誤：拿掉依賴陣列：lint 不抱怨，但每次 render 計時器都重來
import { useEffect } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  useEffect(() => {
    const id = setInterval(() => onRefresh(), everyMs)
    return () => clearInterval(id)
  })
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
