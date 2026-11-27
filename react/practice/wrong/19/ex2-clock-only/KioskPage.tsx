// 錯誤寫法：只把時鐘往下放，深色模式的 state 還在 KioskPage，切換時整頁重新 render
import { useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

export function KioskPage({ products }: { products: readonly Product[] }) {
  const [dark, setDark] = useState(false)
  return (
    <main>
      <Clock />
      <button type="button" aria-pressed={dark} onClick={() => setDark(d => !d)}>深色模式</button>
      <section aria-label="菜單區" className={dark ? 'dark' : 'light'}>
        <SlowMenu products={products} />
      </section>
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

