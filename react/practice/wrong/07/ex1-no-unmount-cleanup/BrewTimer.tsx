// 錯誤寫法：卸載時沒有清計時器，元件不在了還繼續 setSeconds
import { useRef, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timerId.current !== null) return
    timerId.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stop() {
    if (timerId.current === null) return
    clearInterval(timerId.current)
    timerId.current = null
  }

  return (
    <section>
      <p role="timer">已沖煮 {seconds} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
