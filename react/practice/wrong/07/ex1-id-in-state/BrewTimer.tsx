// 錯誤寫法：id 放 state。功能正常，但按「開始」「停止」各多一次沒有意義的重新 render
import { useEffect, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  const [timerId, setTimerId] = useState<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timerId !== null) return
    setTimerId(setInterval(() => setSeconds(s => s + 1), 1000))
  }
  function stop() {
    if (timerId === null) return
    clearInterval(timerId)
    setTimerId(null)
  }
  useEffect(() => () => {
    if (timerId !== null) clearInterval(timerId)
  }, [timerId])

  return (
    <section>
      <p role="timer">已沖煮 {seconds} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
