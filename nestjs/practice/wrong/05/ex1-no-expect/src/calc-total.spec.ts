import { calcTotal } from './calc-total.js'

describe('calcTotal', () => {
  it('算得出來', () => {
    calcTotal([{ name: '拿鐵', price: 110, size: 'L', quantity: 2 }], true)
    calcTotal([], false)
  })
})
