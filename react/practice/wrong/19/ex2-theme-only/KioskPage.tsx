// 錯誤寫法：只抽出 ThemePanel，時鐘還在 KioskPage，每秒建立新的 <SlowMenu /> element
import { useEffect, useState, type ReactNode } from 'react'
import type { Product } from '../../helpers/fake-api.ts'
import { SlowMenu } from './SlowMenu.tsx'
import { formatTime } from './clock.ts'

export function KioskPage({ products }: { products: readonly Product[] }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <main>
      <p role="timer">現在 {formatTime(now)}</p>
      <ThemePanel>
        <SlowMenu products={products} />
      </ThemePanel>
    </main>
  )
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
