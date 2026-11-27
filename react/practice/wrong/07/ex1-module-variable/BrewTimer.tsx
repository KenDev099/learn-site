// 錯誤寫法：id 放在元件外面的變數。所有 BrewTimer 共用同一個，第二個計時器按「開始」會被當成「已經在跑」
import { useEffect, useState } from 'react'

let timerId: ReturnType<typeof setInterval> | null = null

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)

  function start() {
    if (timerId !== null) return
    timerId = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stop() {
    if (timerId === null) return
    clearInterval(timerId)
    timerId = null
  }
  useEffect(() => () => {
    if (timerId !== null) clearInterval(timerId)
    timerId = null
  }, [])

  return (
    <section>
      <p role="timer">已沖煮 {seconds} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
