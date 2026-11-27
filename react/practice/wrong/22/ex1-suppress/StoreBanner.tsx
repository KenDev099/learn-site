const hourFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' })

export function StoreBanner({ now }: { now: number }) {
  const hour = Number(hourFormat.format(now))
  const open = hour >= 7 && hour < 19

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {/* 錯：只讓警告閉嘴，React 不會把伺服器的空字串改成瀏覽器的文字 */}
      <p className="width" suppressHydrationWarning>
        {typeof window === 'undefined' ? '' : `螢幕寬度：${window.innerWidth}px`}
      </p>
    </section>
  )
}
