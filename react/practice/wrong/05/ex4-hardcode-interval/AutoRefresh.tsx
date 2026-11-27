// 錯誤：間隔寫死 30000，沒用 everyMs
import { useEffect, useEffectEvent } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  const onTick = useEffectEvent(() => { onRefresh() })
  useEffect(() => {
    const id = setInterval(() => onTick(), 30000)
    return () => clearInterval(id)
  }, [])
  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
