import { calcTotal } from './calc-total.js'

describe('calcTotal', () => {
  it('結果跟快照一樣', () => {
    expect(calcTotal([], false)).toMatchSnapshot()
    expect(calcTotal([{ name: '拿鐵', price: 110, size: 'L', quantity: 2 }], true)).toMatchSnapshot()
    expect(calcTotal([{ name: '拿鐵', price: 110, size: 'S', quantity: 1 }], false)).toMatchSnapshot()
  })
})
