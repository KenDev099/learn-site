// 練習 2：訂單看板的自動更新 OrderPoller（計時器不重來，又能呼叫最新的 onTick）
import { useEffect, useRef } from 'react'

type Props = { intervalMs: number; onTick: () => void }

export function OrderPoller({ intervalMs, onTick }: Props) {
  const latestOnTick = useRef(onTick)
  // 每次 render 完把最新的函式放進盒子（寫在 effect 裡，不在 render 中寫 ref）
  useEffect(() => {
    latestOnTick.current = onTick
  })

  // 計時器只跟 intervalMs 有關：onTick 換了不用重來，時間到再從盒子拿最新的
  useEffect(() => {
    const id = setInterval(() => latestOnTick.current(), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return <p>每 {intervalMs / 1000} 秒自動更新訂單</p>
}
