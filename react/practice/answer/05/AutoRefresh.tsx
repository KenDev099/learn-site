import { useEffect, useEffectEvent } from 'react'

export function AutoRefresh({ everyMs, onRefresh }: { everyMs: number; onRefresh: () => void }) {
  // Effect Event：每次被呼叫都讀到最新的 onRefresh，但它不是響應值，不用（也不能）列在依賴陣列
  const onTick = useEffectEvent(() => { onRefresh() })

  useEffect(() => {
    const id = setInterval(() => onTick(), everyMs)
    return () => clearInterval(id)
  }, [everyMs])   // 只有間隔改變才需要重建計時器

  return <p>每 {everyMs / 1000} 秒自動更新菜單</p>
}
