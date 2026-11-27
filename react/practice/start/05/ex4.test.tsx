import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { AutoRefresh } from './AutoRefresh.tsx'
import { lintHooks } from '../../helpers/lint-hooks.ts'

beforeEach(() => { vi.useFakeTimers() })
const pass = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('練習 4：AutoRefresh 的函式依賴', () => {
  test('每隔 everyMs 呼叫一次 onRefresh', () => {
    const onRefresh = vi.fn()
    render(<AutoRefresh everyMs={30000} onRefresh={onRefresh} />)
    pass(29999)
    expect(onRefresh, '還沒到 30 秒不能呼叫').toHaveBeenCalledTimes(0)
    pass(1)
    expect(onRefresh, '第 30 秒要呼叫一次 onRefresh').toHaveBeenCalledTimes(1)
    pass(60000)
    expect(onRefresh, '90 秒內總共要呼叫 3 次').toHaveBeenCalledTimes(3)
  })

  test('父元件每秒重新 render、每次都傳新的函式，第 30 秒仍然要更新，而且呼叫的是最新的函式', () => {
    const fns = [vi.fn()]
    const { rerender } = render(<AutoRefresh everyMs={30000} onRefresh={fns[0]} />)
    for (let second = 1; second <= 29; second++) {
      pass(1000)
      fns.push(vi.fn())
      rerender(<AutoRefresh everyMs={30000} onRefresh={fns.at(-1)!} />)
    }
    pass(1000)
    const total = fns.reduce((n, f) => n + f.mock.calls.length, 0)
    expect(total, '過了 30 秒，onRefresh 一次都沒被呼叫：父元件每次 render 都讓計時器重來。effect 不能依賴 onRefresh（也不能沒有依賴陣列）：用 useEffectEvent 包住它').toBe(1)
    expect(fns.at(-1), '時間到時呼叫的是舊的 onRefresh：要呼叫最新一次 render 拿到的那個（useEffectEvent 裡讀到的永遠是最新的 props）').toHaveBeenCalledTimes(1)
  })

  test('everyMs 改變時用新的間隔重新計時', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<AutoRefresh everyMs={30000} onRefresh={onRefresh} />)
    pass(20000)
    rerender(<AutoRefresh everyMs={5000} onRefresh={onRefresh} />)
    pass(5000)
    expect(onRefresh, 'everyMs 改成 5000 之後，5 秒就要呼叫一次：everyMs 要列在依賴陣列').toHaveBeenCalledTimes(1)
    pass(5000)
    expect(onRefresh, '舊的 30 秒計時器要清掉：第 30 秒不能多呼叫一次').toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount(), '換間隔之後應該只剩一個計時器').toBe(1)
  })

  test('卸載後清掉計時器，不再呼叫', () => {
    const onRefresh = vi.fn()
    const { unmount } = render(<AutoRefresh everyMs={30000} onRefresh={onRefresh} />)
    unmount()
    pass(60000)
    expect(vi.getTimerCount(), '卸載後還有計時器：effect 要回傳清理函式').toBe(0)
    expect(onRefresh, '卸載後不能再呼叫 onRefresh').toHaveBeenCalledTimes(0)
  })

  test('通過 react-hooks 的檢查，沒有用 eslint-disable', async () => {
    vi.useRealTimers()
    const file = join(import.meta.dirname, 'AutoRefresh.tsx')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 關掉檢查').not.toMatch(/eslint-disable/)
    expect(await lintHooks(file), 'react-hooks 檢查沒過：照訊息修正（Effect Event 不能放進依賴陣列）').toEqual([])
  }, 20000)
})
