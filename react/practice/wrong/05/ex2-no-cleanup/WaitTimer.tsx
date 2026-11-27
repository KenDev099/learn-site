// 錯誤：沒有清理函式
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    setInterval(() => setSeconds(s => s + 1), 1000)
  }, [running])
  return <p role="timer">已等候 {seconds} 秒</p>
}
