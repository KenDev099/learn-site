// 錯誤寫法：計時器的 effect 沒有清理函式。卸載後繼續呼叫；intervalMs 一變就多一個計時器
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latestOnTick = useRef(onTick)
  useEffect(() => {
    latestOnTick.current = onTick
  })

  useEffect(() => {
    setInterval(() => latestOnTick.current(), intervalMs)
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
