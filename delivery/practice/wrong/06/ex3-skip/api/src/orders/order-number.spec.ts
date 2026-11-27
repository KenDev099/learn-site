import { describe, expect, it } from 'vitest'
import { createOrderNumbers } from './order-number.js'

const numbers = createOrderNumbers()

describe('取餐號碼', () => {
  it.skip('第一張是 A001', () => {
    expect(numbers.next()).toBe('A001')
  })

  it.skip('下一張是 A002', () => {
    expect(numbers.next()).toBe('A002')
  })

  it('A999 之後回到 A001', () => {
    const own = createOrderNumbers()
    for (let i = 0; i < 998; i++) own.next()
    expect(own.next()).toBe('A999')
    expect(own.next()).toBe('A001')
  })

  it('開店歸零後從 A001 開始', () => {
    const own = createOrderNumbers()
    own.next()
    own.reset()
    expect(own.next()).toBe('A001')
  })
})
