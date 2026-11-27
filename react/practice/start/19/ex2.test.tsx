import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { KioskPage } from './KioskPage.tsx'
import { formatTime } from './clock.ts'
import { PRODUCTS, type Product } from '../../helpers/fake-api.ts'
import { deepFreeze } from '../../helpers/deep-freeze.ts'

// 數 SlowMenu 被呼叫（render）幾次：把它換成會記數的版本，畫面不變
const menu = vi.hoisted(() => ({ renders: 0 }))
vi.mock('./SlowMenu.tsx', async importOriginal => {
  const mod = await importOriginal<typeof import('./SlowMenu.tsx')>()
  return {
    SlowMenu(props: Parameters<typeof mod.SlowMenu>[0]) {
      menu.renders++
      return mod.SlowMenu(props)
    },
  }
})

const START = new Date(2026, 10, 6, 10, 0, 0)
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  menu.renders = 0
})
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const products = deepFreeze(structuredClone(PRODUCTS) as Product[])
const names = () => within(screen.getByRole('list', { name: '菜單' })).getAllByRole('listitem').map(li => li.textContent)
const toggle = () => screen.getByRole('button', { name: '深色模式' })
const panel = () => screen.getByRole('region', { name: '菜單區' })

describe('練習 2：把 state 往下放、把內容往上提', () => {
  test('時鐘每秒更新，SlowMenu 不重新 render', () => {
    render(<KioskPage products={products} />)
    expect(screen.getByRole('timer')).toHaveTextContent(`現在 ${formatTime(START)}`)
    expect(names()).toHaveLength(6)
    menu.renders = 0
    tick(1000)
    expect(screen.getByRole('timer'), '過了 1 秒，時鐘要更新').toHaveTextContent(`現在 ${formatTime(new Date(START.getTime() + 1000))}`)
    tick(2000)
    expect(screen.getByRole('timer')).toHaveTextContent(`現在 ${formatTime(new Date(START.getTime() + 3000))}`)
    expect(
      menu.renders,
      '時鐘走了 3 秒，SlowMenu 被重新 render 了：時間的 state 和 setInterval 放在 KioskPage，每秒整頁重新 render。把它們搬進只負責顯示時間的 Clock 元件',
    ).toBe(0)
  })

  test('切換深色模式：section 的 class 改變，SlowMenu 不重新 render', () => {
    render(<KioskPage products={products} />)
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(panel()).toHaveClass('light')
    menu.renders = 0
    fireEvent.click(toggle())
    expect(toggle(), '按下後 aria-pressed 要是 true').toHaveAttribute('aria-pressed', 'true')
    expect(panel(), '按下後 section 的 class 是 dark').toHaveClass('dark')
    fireEvent.click(toggle())
    expect(panel(), '再按一次回到 light').toHaveClass('light')
    expect(
      menu.renders,
      '切換深色模式時 SlowMenu 被重新 render 了：開關的 state 在哪個元件，那個元件 render 時自己建立的 <SlowMenu /> 就會跟著 render。讓 ThemePanel 收 children，<SlowMenu /> 寫在 KioskPage、當 children 傳進去',
    ).toBe(0)
  })

  test('products 換了，菜單跟著更新', () => {
    const { rerender } = render(<KioskPage products={products} />)
    const next = deepFreeze<Product[]>([{ id: 11, name: '冰美式', price: 85, category: 'coffee' }])
    rerender(<KioskPage products={next} />)
    expect(names(), 'products 換成新的陣列，菜單要顯示新的商品：不要把 <SlowMenu /> 存進 state 或 ref').toEqual(['冰美式 $85'])
  })

  test('卸載之後沒有計時器', () => {
    const { unmount } = render(<KioskPage products={products} />)
    unmount()
    expect(vi.getTimerCount(), '卸載後計時器還在跑：Clock 的 effect 要回傳清理函式 clearInterval').toBe(0)
  })

  test('沒有用 memo、useMemo、useCallback、useRef', () => {
    const source = readFileSync(join(import.meta.dirname, 'KioskPage.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    expect(source, '這題不用記憶化：靠「state 往下放」和「children」就能讓 SlowMenu 不重新 render').not.toMatch(/\b(memo|useMemo|useCallback|useRef|createRef)\b/)
    expect(source, '不要直接改 DOM').not.toMatch(/\b(textContent|innerHTML|innerText|querySelector|getElementById)\b/)
  })
})
