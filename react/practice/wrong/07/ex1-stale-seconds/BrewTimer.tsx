// 錯誤寫法：setSeconds(seconds + 1)。計時器的函式抓到的是按「開始」那次 render 的 seconds（0），永遠設成 1
import { useEffect, useRef, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timerId.current !== null) return
    timerId.current = setInterval(() => setSeconds(seconds + 1), 1000)
  }
  function stop() {
    if (timerId.current === null) return
    clearInterval(timerId.current)
    timerId.current = null
  }
  useEffect(() => () => {
    if (timerId.current !== null) clearInterval(timerId.current)
  }, [])

  return (
    <section>
      <p role="timer">已沖煮 {seconds} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
