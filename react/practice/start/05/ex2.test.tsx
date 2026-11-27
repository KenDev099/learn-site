import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { WaitTimer } from './WaitTimer.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

beforeEach(() => { vi.useFakeTimers() })
const pass = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const text = () => screen.getByRole('timer').textContent

describe('練習 2：WaitTimer 的計時器與清理', () => {
  test('每秒加 1', () => {
    render(<WaitTimer running />)
    expect(text(), '一開始顯示「已等候 0 秒」').toBe('已等候 0 秒')
    pass(1000)
    expect(text(), '1 秒後顯示「已等候 1 秒」').toBe('已等候 1 秒')
    pass(3000)
    expect(text(), '4 秒後要顯示「已等候 4 秒」。停在 1 秒：計時器的函式抓到的是第一次 render 的 seconds（永遠是 0），改用 setSeconds(s => s + 1)').toBe('已等候 4 秒')
  })

  test('卸載時清掉計時器', () => {
    const { unmount } = render(<WaitTimer running />)
    pass(2000)
    unmount()
    expect(vi.getTimerCount(), '元件卸載後還有計時器在跑：effect 要回傳清理函式 () => clearInterval(id)').toBe(0)
  })

  test('running 變成 false 時停止，變回 true 時從原本的數字繼續', () => {
    const { rerender } = render(<WaitTimer running />)
    pass(2000)
    rerender(<WaitTimer running={false} />)
    expect(vi.getTimerCount(), 'running 變成 false 之後還有計時器：running 要列在依賴陣列，清理函式要 clearInterval').toBe(0)
    pass(5000)
    expect(text(), 'running 是 false 時不計時，數字停在 2').toBe('已等候 2 秒')
    rerender(<WaitTimer running />)
    pass(1000)
    expect(text(), 'running 變回 true 之後，從 2 繼續加到 3').toBe('已等候 3 秒')
    expect(vi.getTimerCount(), '計時中應該只有一個計時器').toBe(1)
  })

  test('一開始 running 是 false 就不計時', () => {
    render(<WaitTimer running={false} />)
    pass(3000)
    expect(text(), 'running 是 false 時不要建立計時器').toBe('已等候 0 秒')
    expect(vi.getTimerCount(), 'running 是 false 時不要建立計時器').toBe(0)
  })

  test('StrictMode 下（開發時 effect 會多跑一輪）一秒還是只加 1', () => {
    render(<StrictMode><WaitTimer running /></StrictMode>)
    expect(vi.getTimerCount(), 'StrictMode 會執行 effect → 清理 → 再執行 effect：沒有清理的話會留下兩個計時器').toBe(1)
    pass(3000)
    expect(text(), '3 秒後要顯示「已等候 3 秒」，變成 6 表示有兩個計時器在跑').toBe('已等候 3 秒')
  })

  test('計時期間只建立一次計時器', () => {
    const create = vi.spyOn(globalThis, 'setInterval')
    render(<WaitTimer running />)
    pass(5000)
    expect(text()).toBe('已等候 5 秒')
    expect(create.mock.calls.length, '5 秒內 setInterval 被呼叫了好幾次：effect 不要依賴 seconds，改用 setSeconds(s => s + 1) 就不用讀 seconds').toBe(1)
  })

  test('通過 react-hooks 的檢查，沒有用 eslint-disable', async () => {
    vi.useRealTimers()
    const file = join(import.meta.dirname, 'WaitTimer.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉檢查').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 檢查沒過：照訊息修正依賴陣列').toEqual([])
  }, 20000)
})
