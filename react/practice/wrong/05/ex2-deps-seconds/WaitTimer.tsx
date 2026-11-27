// 錯誤：把 seconds 列進依賴，每一秒都清掉計時器再重建
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(seconds + 1), 1000)
    return () => clearInterval(id)
  }, [running, seconds])
  return <p role="timer">已等候 {seconds} 秒</p>
}
