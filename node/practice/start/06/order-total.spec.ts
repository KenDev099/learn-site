// 練習 1：為 order-total.ts 寫測試。執行：node --test order-total.spec.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcOrderTotal } from './order-total.ts'

test('一杯拿鐵是 110 元', () => {
  assert.equal(calcOrderTotal([{ name: '拿鐵', price: 110, qty: 1 }]), 110)
})

// 在下面繼續寫：至少 5 個測試，order-total.ts 的每一條規則和它的邊界都要有測試
