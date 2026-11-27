// 錯誤：用了 Effect Event，但沒有清理計時器
import { useEffect, useEffectEvent } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  const onTick = useEffectEvent(() => { onRefresh() })
  useEffect(() => {
    setInterval(() => onTick(), everyMs)
  }, [everyMs])
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
