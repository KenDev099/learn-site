import { describe, expect, it } from 'vitest'
import { createOrderNumbers } from './order-number.js'

describe('取餐號碼', () => {
  it('第一張是 A 開頭', () => {
    expect(createOrderNumbers().next()).toMatch(/^A/)
  })

  it('下一張不一樣', () => {
    const numbers = createOrderNumbers()
    expect(numbers.next()).not.toBe(numbers.next())
  })

  it('很多張也不會出錯', () => {
    const numbers = createOrderNumbers()
    for (let i = 0; i < 1000; i++) expect(typeof numbers.next()).toBe('string')
  })

  it('歸零後還能繼續', () => {
    const numbers = createOrderNumbers()
    numbers.reset()
    expect(numbers.next()).toMatch(/^A/)
  })
})
