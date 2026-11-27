// 錯誤寫法：連 intervalMs 也塞進 ref，effect 只跑一次。lint 沒意見，但間隔改了計時器不會跟著換
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latest = useRef({ intervalMs, onTick })
  useEffect(() => {
    latest.current = { intervalMs, onTick }
  })

  useEffect(() => {
    const id = setInterval(() => latest.current.onTick(), latest.current.intervalMs)
    return () => clearInterval(id)
  }, [])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
