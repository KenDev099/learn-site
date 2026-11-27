// 錯誤：在 render 中建立計時器，每次 render 多一個
import { useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  if (running) setTimeout(() => setSeconds(seconds + 1), 1000)
  return <p role="timer">已等候 {seconds} 秒</p>
}
