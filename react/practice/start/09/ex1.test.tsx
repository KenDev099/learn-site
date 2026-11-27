import { describe, expect, test } from 'vitest'
import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useToggle } from './useToggle.ts'
import { typecheck } from '../../helpers/typecheck.ts'

// 一張卡片呼叫兩次 useToggle：說明（預設收合）與收藏（預設已收藏）
function Card({ name }: { name: string }) {
  const [open, toggleOpen] = useToggle()
  const [liked, toggleLiked] = useToggle(true)
  return (
    <article aria-label={name}>
      <button type="button" aria-pressed={open} onClick={() => toggleOpen()}>說明</button>
      <button type="button" aria-pressed={liked} onClick={() => toggleLiked()}>收藏</button>
    </article>
  )
}
const button = (card: string, name: string) => within(screen.getByRole('article', { name: card })).getByRole('button', { name })

describe('練習 1：useToggle', () => {
  test('initial 是初始值，沒給就是 false', () => {
    expect(renderHook(() => useToggle()).result.current[0], 'useToggle() 的初始值要是 false').toBe(false)
    expect(renderHook(() => useToggle(true)).result.current[0], 'useToggle(true) 的初始值要是 true：把 initial 傳給 useState').toBe(true)
  })

  test('toggle() 把值反過來，setOn(value) 直接指定', () => {
    const { result } = renderHook(() => useToggle())
    act(() => result.current[1]())
    expect(result.current[0], 'toggle() 一次：false → true').toBe(true)
    act(() => result.current[1]())
    expect(result.current[0], 'toggle() 第二次：true → false').toBe(false)
    act(() => result.current[2](true))
    expect(result.current[0], 'setOn(true) 之後要是 true：回傳的第三個元素是 setOn').toBe(true)
  })

  test('同一個事件裡連續 toggle 兩次會回到原值', () => {
    const { result } = renderHook(() => useToggle())
    act(() => {
      result.current[1]()
      result.current[1]()
    })
    expect(result.current[0], '連續兩次 toggle() 要回到 false。setOn(!on) 兩次讀到的都是這次 render 的 on（快照），改用 updater function：setOn(v => !v)').toBe(false)
  })

  test('toggle 的參考穩定：重新 render、值改變之後都是同一個函式', () => {
    const { result, rerender } = renderHook(() => useToggle())
    const first = result.current[1]
    rerender()
    expect(result.current[1], '元件重新 render 之後 toggle 變成另一個函式：用 useCallback(() => setOn(v => !v), []) 包起來').toBe(first)
    act(() => first())
    expect(result.current[1], 'toggle() 之後 toggle 變成另一個函式：toggle 裡不要讀 on（那樣依賴陣列就得放 on），用 updater function').toBe(first)
    expect(result.current[0], '用第一次 render 拿到的 toggle 也要能切換').toBe(true)
  })

  test('每一次呼叫各有自己的 state', async () => {
    const user = userEvent.setup()
    render(<><Card name="拿鐵" /><Card name="可頌" /></>)
    expect(button('拿鐵', '說明'), '說明預設收合（useToggle() 是 false）').toHaveAttribute('aria-pressed', 'false')
    expect(button('拿鐵', '收藏'), '收藏預設是 true（useToggle(true)）').toHaveAttribute('aria-pressed', 'true')

    await user.click(button('拿鐵', '說明'))
    expect(button('拿鐵', '說明'), '按了拿鐵的「說明」要展開').toHaveAttribute('aria-pressed', 'true')
    expect(button('拿鐵', '收藏'), '同一個元件裡的另一次 useToggle 不能跟著變：state 要用 useState 放在 hook 裡，不是模組層級的變數').toHaveAttribute('aria-pressed', 'true')
    expect(button('可頌', '說明'), '另一張卡片的 useToggle 不能跟著變：自訂 hook 共用的是邏輯，不是 state').toHaveAttribute('aria-pressed', 'false')

    await user.click(button('可頌', '收藏'))
    expect(button('可頌', '收藏'), '按了可頌的「收藏」要變成 false').toHaveAttribute('aria-pressed', 'false')
    expect(button('拿鐵', '收藏'), '拿鐵的收藏不能跟著變').toHaveAttribute('aria-pressed', 'true')
  })

  test('回傳值的型別是 tuple', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex1.usage.ts': `
import { useToggle } from './useToggle.ts'
export function useDemo() {
  const [on, toggle, setOn] = useToggle(true)
  const flag: boolean = on
  toggle()
  setOn(false)
  // @ts-expect-error setOn 只收 boolean
  setOn('yes')
  // @ts-expect-error on 是 boolean，不能當函式呼叫
  on()
  return flag
}
`,
    })
    expect(errors, '型別檢查沒過。回傳陣列時 TypeScript 會推成 (boolean | 函式)[]，解構出來每個都是聯合型別：回傳值加上 as const（或標註 tuple 型別），也不能用 any').toBe('')
  }, 30_000)
})
