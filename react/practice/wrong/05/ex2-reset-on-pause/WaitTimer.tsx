// 錯誤：暫停時把秒數歸零
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => { clearInterval(id); setSeconds(0) }
  }, [running])
  return <p role="timer">已等候 {seconds} 秒</p>
}
