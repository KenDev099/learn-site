// 錯誤寫法：用 memo 擋：能擋住，但這題要練的是不靠記憶化的結構
import { memo, useEffect, useState } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

const Menu = memo(SlowMenu)

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
        <Menu products={products} />
      </section>
    </main>
  )
}
