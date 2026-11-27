import { calcTotal, type OrderLine } from './calc-total.js'

const latte = (size: OrderLine['size'], quantity = 1): OrderLine => ({ name: '拿鐵', price: 110, size, quantity })

describe('calcTotal', () => {
  it('沒有品項時是 0', () => {
    expect(calcTotal([], false)).toBe(0)
    expect(calcTotal([], true)).toBe(0)
  })

  it('S 不加價、M 加 10、L 加 20', () => {
    expect(calcTotal([latte('S')], false)).toBe(110)
    expect(calcTotal([latte('M')], false)).toBe(120)
    expect(calcTotal([latte('L')], false)).toBe(130)
  })

  it('加價也要乘上數量，多行要加總', () => {
    const americano: OrderLine = { name: '美式咖啡', price: 80, size: 'M', quantity: 1 }
    expect(calcTotal([latte('L', 2), americano], false)).toBe(130 * 2 + 90)
  })

  it('非會員不打折', () => {
    expect(calcTotal([latte('M')], false)).toBe(120)
  })

  it('會員打九五折，四捨五入到整數元', () => {
    expect(calcTotal([latte('M')], true)).toBe(114)   // 120 × 0.95 = 114
    expect(calcTotal([latte('S')], true)).toBe(105)   // 110 × 0.95 = 104.5 → 105
  })
})
