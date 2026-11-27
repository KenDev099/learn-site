// 錯誤寫法：連秒數也放 ref，在 render 中讀它。改 ref 不會重新 render，畫面永遠是 0
import { useEffect, useRef } from 'react'

export function BrewTimer() {
  const seconds = useRef(0)
  const timerId = useRef<ReturnType<typeof setInterval> | null>(null)

  function start() {
    if (timerId.current !== null) return
    timerId.current = setInterval(() => { seconds.current++ }, 1000)
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
      <p role="timer">已沖煮 {seconds.current} 秒</p>
      <button type="button" onClick={start}>開始</button>
      <button type="button" onClick={stop}>停止</button>
    </section>
  )
}
