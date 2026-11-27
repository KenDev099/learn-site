import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OrderPoller } from './OrderPoller.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

beforeEach(() => { vi.useFakeTimers() })
const tick = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('練習 2：OrderPoller 計時不重來，又呼叫最新的 onTick', () => {
  test('每 intervalMs 毫秒呼叫一次 onTick', () => {
    const onTick = vi.fn()
    render(<OrderPoller intervalMs={1000} onTick={onTick} />)
    tick(999)
    expect(onTick, '還沒到 1 秒，不該呼叫').not.toHaveBeenCalled()
    tick(1)
    expect(onTick, '滿 1 秒要呼叫第 1 次').toHaveBeenCalledTimes(1)
    tick(3000)
    expect(onTick, '4 秒一共要呼叫 4 次：要用 setInterval，不是只跑一次的 setTimeout').toHaveBeenCalledTimes(4)
  })

  test('父元件重新 render（傳新的 onTick）時，計時不能重來', () => {
    const calls: string[] = []
    const view = render(<OrderPoller intervalMs={1000} onTick={() => calls.push('第 0 版')} />)
    // 父元件每 400 毫秒重新 render 一次，每次都傳一個新的函式
    for (let i = 1; i <= 10; i++) {
      tick(400)
      view.rerender(<OrderPoller intervalMs={1000} onTick={() => calls.push(`第 ${i} 版`)} />)
    }
    expect(calls.length, '4 秒內應該呼叫 4 次。如果 onTick 在計時器那個 effect 的依賴陣列裡，每次重新 render 計時器都會被清掉重來，永遠等不到 1 秒').toBe(4)
  })

  test('時間到的時候呼叫最新的 onTick', () => {
    const first = vi.fn(), second = vi.fn()
    const view = render(<OrderPoller intervalMs={1000} onTick={first} />)
    tick(500)
    view.rerender(<OrderPoller intervalMs={1000} onTick={second} />)
    tick(500)
    expect(first, '第 0.5 秒時 onTick 已經換成新的，滿 1 秒時不能再呼叫舊的函式（舊的函式看到的是舊的 props／state）').not.toHaveBeenCalled()
    expect(second, '滿 1 秒時要呼叫最新的 onTick：把最新的函式放在 ref 裡（在 effect 裡更新），計時器從 ref 讀').toHaveBeenCalledTimes(1)
  })

  test('intervalMs 改變時，用新的間隔重新計時', () => {
    const onTick = vi.fn()
    const view = render(<OrderPoller intervalMs={1000} onTick={onTick} />)
    tick(1000)
    expect(onTick).toHaveBeenCalledTimes(1)
    view.rerender(<OrderPoller intervalMs={250} onTick={onTick} />)
    tick(1000)
    expect(onTick, '改成 250 毫秒後的 1 秒內要再呼叫 4 次（一共 5 次）：intervalMs 要在計時器那個 effect 的依賴陣列裡，舊的計時器要清掉').toHaveBeenCalledTimes(5)
    expect(vi.getTimerCount(), '只能有一個計時器在跑').toBe(1)
  })

  test('卸載後不再呼叫，計時器要清掉', () => {
    const onTick = vi.fn()
    const view = render(<OrderPoller intervalMs={1000} onTick={onTick} />)
    view.unmount()
    tick(5000)
    expect(onTick, '卸載後不能再呼叫 onTick：effect 要回傳清理函式 clearInterval').not.toHaveBeenCalled()
    expect(vi.getTimerCount(), '卸載後不能有計時器留著').toBe(0)
  })

  test('依賴陣列完整、不在 render 過程中讀寫 ref、不關掉 lint 規則', async () => {
    const file = join(import.meta.dirname, 'OrderPoller.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉規則').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file, { 'react-hooks/refs': 'error' }), 'effect 用到的 props 都要列在依賴陣列；ref.current 的更新要寫在 effect 裡，不能寫在元件函式本體').toEqual([])
  }, 20000)
})
