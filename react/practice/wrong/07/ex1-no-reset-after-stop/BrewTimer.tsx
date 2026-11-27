// 錯誤寫法：停止後沒有把 ref.current 設回 null，「已經在跑」的判斷永遠成立，不能再開始
import { useEffect, useRef, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timerId.current !== null) return
    timerId.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stop() {
    if (timerId.current !== null) clearInterval(timerId.current)
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
