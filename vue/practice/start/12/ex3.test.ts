import { describe, expect, test, vi } from 'vitest'
import { effectScope, isReadonly, isRef } from 'vue'
import { useCartBadge } from './useCartBadge.ts'

describe('練習 3：useCartBadge 每次呼叫各自一份', () => {
  test('店內和外帶各自計數，互不影響', () => {
    const dineIn = effectScope().run(() => useCartBadge())!
    const takeout = effectScope().run(() => useCartBadge())!
    dineIn.add()
    dineIn.add(2)
    expect(dineIn.count.value).toBe(3)
    expect(takeout.count.value, '外帶的數字跟著店內變了：count 寫在模組最外層，所有呼叫共用同一份。把 ref 移進函式裡').toBe(0)
    takeout.add()
    takeout.clear()
    expect(dineIn.count.value, '清空外帶不能影響店內').toBe(3)
  })

  test('解構出來的 count 仍是 ref，會跟著 add 更新', () => {
    const { count, add } = useCartBadge()
    expect(isRef(count), '回傳由 ref 組成的普通物件，不要回傳 reactive({ … })：解構 reactive 會拿到數字，失去響應').toBe(true)
    expect(count.value, '每次呼叫都從 0 開始').toBe(0)
    add()
    expect(count.value).toBe(1)
  })

  test('count 對外唯讀，只能透過 add／clear 修改', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { count, clear, add } = useCartBadge()
    add(2)
    expect(isReadonly(count), 'count 要用 readonly() 包起來再回傳，呼叫端才不能直接改 count.value').toBe(true)
    ;(count as { value: number }).value = 99
    expect(count.value).toBe(2)
    clear()
    expect(count.value).toBe(0)
    warn.mockRestore()
  })
})
