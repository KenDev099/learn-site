const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })

export function StoreBanner({ now }: { now: number }) {
  const hour = Number(hourFormat.format(now))
  const open = hour >= 7 && hour < 19
  const width = typeof window !== 'undefined' ? window.innerWidth : null   // 錯：伺服器 null、瀏覽器 1024，第一次 render 不同

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {width !== null && <p className="width">螢幕寬度：{width}px</p>}
    </section>
  )
}
