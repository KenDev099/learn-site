// 錯誤：用 eslint-disable 把 onRefresh 拿掉：計時器不會重來了，但呼叫的永遠是第一次 render 的函式
import { useEffect } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  useEffect(() => {
    const id = setInterval(() => onRefresh(), everyMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyMs])
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
