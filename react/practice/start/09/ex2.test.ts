import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedValue } from './useDebouncedValue.ts'
import { lintHooks } from '../../helpers/lint-hooks.ts'
import { typecheck } from '../../helpers/typecheck.ts'

// seen 記下每一次 render 回傳的值：中間不該出現的值會留在這裡
function setup(initial: string, delayMs: number) {
  const seen: string[] = []
  const view = renderHook(({ value, delay }) => {
    const debounced = useDebouncedValue(value, delay)
    seen.push(debounced)
    return debounced
  }, { initialProps: { value: initial, delay: delayMs } })
  const type = (value: string, delay = delayMs) => view.rerender({ value, delay })
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
  return { ...view, seen, type, wait }
}

describe('練習 2：useDebouncedValue', () => {
  beforeEach(() => { vi.useFakeTimers() })

  test('第一次 render 直接回傳 value', () => {
    const { result } = setup('拿', 300)
    expect(result.current, '第一次 render 不用等：useState 的初始值就是 value').toBe('拿')
  })

  test('value 改變後，滿 delayMs 才跟上', () => {
    const { result, type, wait } = setup('', 300)
    type('拿鐵')
    expect(result.current, 'value 剛改變時還是舊的值').toBe('')
    wait(299)
    expect(result.current, '299ms 時還沒到，還是舊的值').toBe('')
    wait(1)
    expect(result.current, '滿 300ms 要變成「拿鐵」').toBe('拿鐵')
  })

  test('delayMs 由參數決定', () => {
    const { result, type, wait } = setup('', 1000)
    type('可頌')
    wait(999)
    expect(result.current, 'delayMs 是 1000，999ms 時還不能更新：setTimeout 的時間用參數 delayMs，不是寫死的數字').toBe('')
    wait(1)
    expect(result.current, '滿 1000ms 要變成「可頌」').toBe('可頌')
  })

  test('連續輸入：每變一次重新計時，中間的值不會出現', () => {
    const { result, type, wait, seen } = setup('', 300)
    type('拿')
    wait(200)
    type('拿鐵')
    wait(200)
    type('拿鐵咖')
    wait(299)
    expect(result.current, '最後一次輸入後還沒滿 300ms，不能更新。每次 value 改變都要清掉上一個計時器：effect 回傳 () => clearTimeout(timer)').toBe('')
    wait(1)
    expect(result.current, '停止輸入滿 300ms，要變成最後的值').toBe('拿鐵咖')
    expect([...new Set(seen)], '回傳值只能出現過「」和「拿鐵咖」：中間的「拿」「拿鐵」出現了，代表舊的計時器沒清掉').toEqual(['', '拿鐵咖'])
  })

  test('跟 value 無關的重新 render 不會讓計時重來', () => {
    const { result, type, wait, rerender } = setup('', 300)
    type('茶')
    wait(200)
    rerender({ value: '茶', delay: 300 })   // 父元件因為別的原因重新 render
    wait(100)
    expect(result.current, '從「茶」開始算已經滿 300ms。effect 沒有依賴陣列時每次 render 都會重來：依賴陣列寫 [value, delayMs]').toBe('茶')
  })

  test('卸載時清掉計時器', () => {
    const { type, unmount } = setup('', 300)
    type('紅茶')
    unmount()
    expect(vi.getTimerCount(), '元件卸載後還有計時器在跑：effect 要回傳清理函式 clearTimeout').toBe(0)
  })

  test('泛型：傳什麼型別就回傳什麼型別', () => {
    const errors = typecheck(import.meta.dirname, {
      '__ex2.usage.ts': `
import { useDebouncedValue } from './useDebouncedValue.ts'
export function useDemo() {
  const quantity: number = useDebouncedValue(3, 300)
  const keyword: string = useDebouncedValue('拿鐵', 300)
  // @ts-expect-error 傳 number 進去，回傳的不能當 string
  const wrong: string = useDebouncedValue(3, 300)
  return { quantity, keyword, wrong }
}
`,
    })
    expect(errors, '型別檢查沒過：簽章要是 useDebouncedValue<T>(value: T, delayMs: number): T，不能用 any').toBe('')
  }, 30_000)

  test('react-hooks 的 lint 規則通過，沒有用 eslint-disable', async () => {
    const file = join(import.meta.dirname, 'useDebouncedValue.ts')
    expect(readFileSync(file, 'utf8'), '不能用 eslint-disable 蓋掉規則：把 effect 用到的值列進依賴陣列').not.toMatch(/eslint-disable/)
    const problems = await lintHooks(file)
    expect(problems.map(p => `第 ${p.line} 行 ${p.rule}：${p.message}`), 'effect 裡用到的 value、delayMs 都要列在依賴陣列').toEqual([])
  }, 30_000)
})
