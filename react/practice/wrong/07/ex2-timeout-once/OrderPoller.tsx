// 錯誤寫法：用 setTimeout，只會呼叫一次
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latestOnTick = useRef(onTick)
  useEffect(() => {
    latestOnTick.current = onTick
  })

  useEffect(() => {
    const id = setTimeout(() => latestOnTick.current(), intervalMs)
    return () => clearTimeout(id)
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
