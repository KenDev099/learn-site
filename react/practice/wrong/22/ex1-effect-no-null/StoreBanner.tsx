import { useEffect, useState } from 'react'

const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })

export function StoreBanner({ now }: { now: number }) {
  const hour = Number(hourFormat.format(now))
  const open = hour >= 7 && hour < 19
  // 錯：初始值在伺服器是 0、在瀏覽器是 1024，第一次 render 還是不同；effect 救不了初始值
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth))
  useEffect(() => {
    setWidth(window.innerWidth)
  }, [])

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {width > 0 && <p className="width">螢幕寬度：{width}px</p>}
    </section>
  )
}
