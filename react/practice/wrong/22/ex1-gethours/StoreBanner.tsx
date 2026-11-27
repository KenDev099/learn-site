import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export function StoreBanner({ now }: { now: number }) {
  const hour = new Date(now).getHours()   // 錯：用執行環境的時區，伺服器在 UTC
  const open = hour >= 7 && hour < 19
  const width = useSyncExternalStore(subscribe, () => window.innerWidth, () => null)

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {width !== null && <p className="width">螢幕寬度：{width}px</p>}
    </section>
  )
}
