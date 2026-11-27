import { test } from 'node:test'
import assert from 'node:assert/strict'
import { orderTotal } from '../../src/price.ts'

test('拿鐵兩杯加可頌一個是 290 元', () => {
  assert.equal(orderTotal([{ price: 110, quantity: 2 }, { price: 70, quantity: 1 }]), 290)
})

test('空訂單與數量 0 都要被拒絕', () => {
  assert.throws(() => orderTotal([]), /至少要有一個品項/)
  assert.throws(() => orderTotal([{ price: 80, quantity: 0 }]), /正整數/)
})
