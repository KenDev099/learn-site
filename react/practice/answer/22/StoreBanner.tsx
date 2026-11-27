import { useSyncExternalStore } from 'react'

const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export function StoreBanner({ now }: { now: number }) {
  const hour = Number(hourFormat.format(now))   // 指定台北時區，不看執行環境
  const open = hour >= 7 && hour < 19
  // 伺服器與 hydration 用 getServerSnapshot（null）；hydration 之後 React 改用瀏覽器的值重新 render
  const width = useSyncExternalStore(subscribe, () => window.innerWidth, () => null)

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {width !== null && <p className="width">螢幕寬度：{width}px</p>}
    </section>
  )
}
