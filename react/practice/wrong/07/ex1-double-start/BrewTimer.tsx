// 錯誤寫法：沒檢查是不是已經在跑。連按兩次「開始」開了兩個計時器，第一個的 id 被蓋掉，再也清不到
import { useEffect, useRef, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    timerId.current = setInterval(() => setSeconds(s => s + 1), 1000)
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
