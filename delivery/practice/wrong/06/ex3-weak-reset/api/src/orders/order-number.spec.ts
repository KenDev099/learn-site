// 每個測試自己建立號碼產生器：不管用什麼順序跑、單獨跑哪一個，結果都一樣
import { describe, expect, it } from 'vitest'
import { createOrderNumbers } from './order-number.js'

describe('取餐號碼', () => {
  it('第一張是 A001', () => {
    const numbers = createOrderNumbers()
    expect(numbers.next()).toBe('A001')
  })

  it('下一張是 A002', () => {
    const numbers = createOrderNumbers()
    numbers.next()
    expect(numbers.next()).toBe('A002')
  })

  it('A999 之後回到 A001', () => {
    const numbers = createOrderNumbers()
    for (let i = 0; i < 998; i++) numbers.next()
    expect(numbers.next()).toBe('A999')
    expect(numbers.next()).toBe('A001')
  })

  it('開店歸零後從 A001 開始', () => {
    const numbers = createOrderNumbers()
    numbers.reset()
    expect(numbers.next()).toBe('A001')
  })
})
