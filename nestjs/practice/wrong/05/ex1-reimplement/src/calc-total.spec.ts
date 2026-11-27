import { calcTotal, SIZE_UPCHARGE, type OrderLine } from './calc-total.js'

// 用同一套公式算預期值：程式的常數錯了，預期值也跟著錯
const expected = (lines: OrderLine[], member: boolean) => {
  const subtotal = lines.reduce((s, l) => s + (l.price + SIZE_UPCHARGE[l.size]) * l.quantity, 0)
  return member ? Math.round((subtotal * 95) / 100) : subtotal
}

describe('calcTotal', () => {
  const cases: [OrderLine[], boolean][] = [
    [[], false],
    [[{ name: '拿鐵', price: 110, size: 'S', quantity: 1 }], true],
    [[{ name: '拿鐵', price: 110, size: 'L', quantity: 2 }], false],
    [[{ name: '美式咖啡', price: 80, size: 'M', quantity: 3 }], true],
  ]
  it.each(cases)('%j member=%s', (lines, member) => {
    expect(calcTotal(lines, member)).toBe(expected(lines, member))
  })
})
