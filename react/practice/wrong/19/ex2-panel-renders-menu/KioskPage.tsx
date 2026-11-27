// 錯誤寫法：ThemePanel 自己建立 <SlowMenu />，不是收 children
import { useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

export function KioskPage({ products }: { products: readonly Product[] }) {
  return (
    <main>
      <Clock />
      <ThemePanel products={products} />
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

// state 搬進 ThemePanel 了，但 <SlowMenu /> 是 ThemePanel 自己建立的，切換時跟著 render
function ThemePanel({ products }: { products: readonly Product[] }) {
  const [dark, setDark] = useState(false)
  return (
    <>
      <button type="button" aria-pressed={dark} onClick={() => setDark(d => !d)}>深色模式</button>
      <section aria-label="菜單區" className={dark ? 'dark' : 'light'}>
        <SlowMenu products={products} />
      </section>
    </>
  )
}
