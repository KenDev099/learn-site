// 錯誤寫法：useRef(onTick) 只在第一次 render 用到初始值，之後沒有更新，ref 裡永遠是第一版
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latestOnTick = useRef(onTick)

  useEffect(() => {
    const id = setInterval(() => latestOnTick.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
