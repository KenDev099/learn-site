// 練習 1：沖煮計時器 BrewTimer（計時器 id 放 ref）
import { useEffect, useRef, useState } from 'react'

export function BrewTimer() {
  const [seconds, setSeconds] = useState(0)                               // 畫面要顯示 → state
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)     // 畫面用不到、要跨 render 保留 → ref

  function start() {
    if (timerId.current !== null) return                                  // 已經在跑：不要再開第二個
    timerId.current = setInterval(() => setSeconds(s => s + 1), 1000)
  }
  function stop() {
    if (timerId.current === null) return
    clearInterval(timerId.current)
    timerId.current = null                                                // 清掉，之後才能再開始
  }

  // 元件卸載時計時器還在跑的話要停掉
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
