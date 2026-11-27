/*
練習 2：不用 memo，靠元件的結構讓慢的菜單不重新 render（KioskPage）
問題：
  點餐機的頁面有每秒更新的時鐘和「深色模式」開關，兩個 state 都放在 KioskPage。
  時鐘每走一秒、每切換一次深色模式，很慢的 SlowMenu 都跟著重新 render。
要求：
  1. 時鐘每秒更新（<p role="timer">「現在 10:00:05」，時間用 clock.ts 的 formatTime），SlowMenu 不重新 render
     → 把時鐘的 state 和計時器往下放，放進自己的元件（例如 Clock）
  2. 按「深色模式」切換 <section aria-label="菜單區"> 的 class（'dark'／'light'），按鈕用 aria-pressed 表示開關，
     SlowMenu 不重新 render
     → 開關和 section 抽成一個收 children 的元件（例如 ThemePanel），SlowMenu 由 KioskPage 當 children 傳進去
  3. products 換了，菜單要顯示新的內容
  4. 卸載後不能留下計時器
不能做的事：
  - 不要改 SlowMenu.tsx、clock.ts
  - 這題不能用 memo、useMemo、useCallback，也不能用 useRef 存 element 或直接改 DOM
*/
import { useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

export function KioskPage({ products }: { products: readonly Product[] }) {
  const [now, setNow] = useState(() => new Date())
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <main>
      <p role="timer">現在 {formatTime(now)}</p>
      <button type="button" aria-pressed={dark} onClick={() => setDark(d => !d)}>深色模式</button>
      <section aria-label="菜單區" className={dark ? 'dark' : 'light'}>
        <SlowMenu products={products} />
      </section>
    </main>
  )
}
