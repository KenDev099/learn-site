// 錯誤寫法：把 onTick 從依賴陣列拿掉、關掉 lint。計時不重來了，但永遠呼叫第一次 render 的 onTick
import { useEffect } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  useEffect(() => {
    const id = setInterval(onTick, intervalMs)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
