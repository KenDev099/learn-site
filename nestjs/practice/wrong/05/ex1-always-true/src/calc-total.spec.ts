import { calcTotal } from './calc-total.js'

describe('calcTotal', () => {
  it('可以呼叫', () => {
    calcTotal([{ name: '拿鐵', price: 110, size: 'L', quantity: 2 }], true)
    expect(true).toBe(true)
  })
})
