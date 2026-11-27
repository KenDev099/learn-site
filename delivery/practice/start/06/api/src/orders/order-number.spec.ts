import { describe, expect, it } from 'vitest'
import { nextOrderNumber, resetOrderNumbers } from './order-number.js'

describe('取餐號碼', () => {
  it('第一張是 A001', () => {
    expect(nextOrderNumber()).toBe('A001')
  })

  it('下一張是 A002', () => {
    expect(nextOrderNumber()).toBe('A002')
  })

  it('A999 之後回到 A001', () => {
    resetOrderNumbers()
    for (let i = 0; i < 998; i++) nextOrderNumber()
    expect(nextOrderNumber()).toBe('A999')
    expect(nextOrderNumber()).toBe('A001')
  })

  it('開店歸零後從 A001 開始', () => {
    nextOrderNumber()
    resetOrderNumbers()
    expect(nextOrderNumber()).toBe('A001')
  })
})
