// 錯誤：把 Effect Event 放進依賴陣列：它每次 render 都是新的，計時器照樣重來
import { useEffect, useEffectEvent } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  const onTick = useEffectEvent(() => { onRefresh() })
  useEffect(() => {
    const id = setInterval(() => onTick(), everyMs)
    return () => clearInterval(id)
  }, [everyMs, onTick])
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
