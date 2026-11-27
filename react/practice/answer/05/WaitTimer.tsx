import { useEffect, useState } from 'react'

export function WaitTimer({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) return   // 不用計時：這次沒有東西要同步，也就沒有東西要清理
    // updater function 不讀 seconds，effect 就不依賴 seconds，計時器不用每秒重建
    const id = setInterval(() => setSeconds(s => s + 1), 1000)
    return () => clearInterval(id)   // running 改變或卸載時，把這一次建立的計時器清掉
  }, [running])

  return <p role="timer">已等候 {seconds} 秒</p>
}
