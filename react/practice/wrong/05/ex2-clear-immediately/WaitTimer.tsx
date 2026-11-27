// 錯誤：return clearInterval(id) 是當場清掉，不是回傳清理函式
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return clearInterval(id)
  }, [running])
  return <p role="timer">已等候 {seconds} 秒</p>
}
