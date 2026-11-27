import test from 'node:test'
import assert from 'node:assert/strict'
import { calcOrderTotal } from './order-total.ts'

test('金額規則', () => {
  assert.equal(calcOrderTotal([{ name: '美式咖啡', price: 80, qty: 1 }, { name: '拿鐵', price: 110, qty: 2 }]), 270)
  assert.equal(calcOrderTotal([{ name: '美式咖啡', price: 80, qty: 1 }, { name: '起司蛋糕', price: 120, qty: 2 }], 'LATTE10'), 288)
})
test('優惠碼', () => {
  assert.equal(calcOrderTotal([{ name: '季節特調', price: 105, qty: 1 }], 'latte10'), 95)
})
test('數量 0', () => {
  assert.throws(() => calcOrderTotal([{ name: '拿鐵', price: 110, qty: 0 }]), RangeError)
})
test('數量 1.5', () => {
  assert.throws(() => calcOrderTotal([{ name: '拿鐵', price: 110, qty: 1.5 }]), RangeError)
})
