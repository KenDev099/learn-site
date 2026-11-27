// 錯誤寫法：在 render 過程中寫 ref。render 可能被呼叫多次或被丟棄，ref 會留下沒有 commit 的那一版函式
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latestOnTick = useRef(onTick)
  latestOnTick.current = onTick

  useEffect(() => {
    const id = setInterval(() => latestOnTick.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
