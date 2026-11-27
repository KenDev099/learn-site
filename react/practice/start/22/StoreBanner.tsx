/*
練習 1：伺服器和瀏覽器第一次 render 要一樣（StoreBanner）
問題：
  門市首頁改成伺服器渲染之後，橫幅的營業狀態一下「營業中」一下「休息中」，
  console 出現 hydration 的錯誤，螢幕寬度那一行有時候閃一下才出現。
要求：
  1. 伺服器上沒有 window 也能 render
  2. 營業狀態只由 props.now（毫秒時間戳）決定：台北時間 07:00（含）到 19:00（不含）是「營業中」，其他是「休息中」
     → 伺服器在 UTC、使用者可能在別的時區，不能用執行環境的時區算小時
  3. 螢幕寬度只有瀏覽器知道：伺服器和 hydration 時都不顯示，hydration 之後才顯示「螢幕寬度：1024px」
  4. hydration 時不能有任何不一致（不能用 suppressHydrationWarning 蓋掉）
不能做的事：
  - 不要改 ssr-utils.tsx
*/
export function StoreBanner({ now }: { now: number }) {
  const hour = new Date().getHours()
  const open = hour >= 7 && hour < 19
  const width = typeof window !== 'undefined' ? window.innerWidth : null

  return (
    <section aria-label="門市">
      <h2>豆留咖啡 總店</h2>
      <p className="status">{open ? '營業中' : '休息中'}</p>
      {width !== null && <p className="width">螢幕寬度：{width}px</p>}
    </section>
  )
}
