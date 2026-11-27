// 錯誤：把第一次拿到的 onRefresh 存進 state：參考穩定了，但永遠是舊的函式
import { useEffect, useState } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  const [first] = useState(() => onRefresh)
  useEffect(() => {
    const id = setInterval(() => first(), everyMs)
    return () => clearInterval(id)
  }, [everyMs, first])
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
