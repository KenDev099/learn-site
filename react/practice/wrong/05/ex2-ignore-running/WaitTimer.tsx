// 錯誤：沒看 running，訂單完成了還在計時
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])
  return <p role="timer">已等候 {seconds} 秒</p>
}
