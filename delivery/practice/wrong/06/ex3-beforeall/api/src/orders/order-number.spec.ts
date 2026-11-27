import { beforeAll, describe, expect, it } from 'vitest'
import { createOrderNumbers } from './order-number.js'

// 只在最前面建立（重置）一次：所有測試共用同一組號碼
let numbers: ReturnType<typeof createOrderNumbers>
beforeAll(() => {
  numbers = createOrderNumbers()
})

describe('取餐號碼', () => {
  it('第一張是 A001', () => {
    expect(numbers.next()).toBe('A001')
  })

  it('下一張是 A002', () => {
    expect(numbers.next()).toBe('A002')
  })

  it('A999 之後回到 A001', () => {
    numbers.reset()
    for (let i = 0; i < 998; i++) numbers.next()
    expect(numbers.next()).toBe('A999')
    expect(numbers.next()).toBe('A001')
  })

  it('開店歸零後從 A001 開始', () => {
    numbers.next()
    numbers.reset()
    expect(numbers.next()).toBe('A001')
  })
})
