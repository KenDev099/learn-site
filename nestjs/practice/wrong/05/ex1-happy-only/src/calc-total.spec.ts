import { calcTotal } from './calc-total.js'

describe('calcTotal', () => {
  it('一杯中杯拿鐵', () => {
    expect(calcTotal([{ name: '拿鐵', price: 110, size: 'M', quantity: 1 }], false)).toBe(120)
    expect(calcTotal([{ name: '拿鐵', price: 110, size: 'M', quantity: 1 }], true)).toBe(114)
  })
})
