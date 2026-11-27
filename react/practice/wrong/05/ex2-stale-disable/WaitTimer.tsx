// 錯誤：讀了 seconds 卻不列依賴，用 eslint-disable 蓋掉：永遠停在 1
import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds(seconds + 1), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])
  return <p role="timer">已等候 {seconds} 秒</p>
}
