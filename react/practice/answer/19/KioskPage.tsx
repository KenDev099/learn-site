import { useEffect, useState, type ReactNode } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

// KioskPage 自己沒有 state：時鐘、開關改變時，它不會重新 render
export function KioskPage({ products }: { products: readonly Product[] }) {
  return (
    <main>
      <Clock />
      <ThemePanel>
        <SlowMenu products={products} />
      </ThemePanel>
    </main>
  )
}

// state 往下放：每秒只有 Clock 重新 render
function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <p role="timer">現在 {formatTime(now)}</p>
}

// 內容往上提：children 是 KioskPage 建立的 element，ThemePanel 重新 render 時它還是同一個物件，React 跳過它
function ThemePanel({ children }: { children: ReactNode }) {
  const [dark, setDark] = useState(false)
  return (
    <>
      <button type="button" aria-pressed={dark} onClick={() => setDark(d => !d)}>深色模式</button>
      <section aria-label="菜單區" className={dark ? 'dark' : 'light'}>
        {children}
      </section>
    </>
  )
}
