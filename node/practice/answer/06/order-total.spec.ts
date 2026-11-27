// 練習 1：為 order-total.ts 寫測試。執行：node --test order-total.spec.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { calcOrderTotal } from './order-total.ts'

test('一杯拿鐵是 110 元', () => {
  assert.equal(calcOrderTotal([{ name: '拿鐵', price: 110, qty: 1 }]), 110)
})

test('小計是單價 × 數量，全部加總', () => {
  const items = [{ name: '拿鐵', price: 110, qty: 2 }, { name: '可頌', price: 70, qty: 1 }]
  assert.equal(calcOrderTotal(items), 290)
})

test('沒有品項時是 0 元', () => {
  assert.equal(calcOrderTotal([]), 0)
})

test('LATTE10 打九折', () => {
  assert.equal(calcOrderTotal([{ name: '拿鐵', price: 110, qty: 2 }], 'LATTE10'), 198)
})

test('優惠碼不分大小寫', () => {
  assert.equal(calcOrderTotal([{ name: '拿鐵', price: 110, qty: 2 }], 'latte10'), 198)
})

test('剛好 300 元也折 30', () => {
  const items = [{ name: '美式咖啡', price: 80, qty: 1 }, { name: '拿鐵', price: 110, qty: 2 }]
  assert.equal(calcOrderTotal(items), 270)
})

test('先打折再看有沒有滿 300', () => {
  // 原價 320，打九折後 288，沒有滿 300，不再折 30
  const items = [{ name: '美式咖啡', price: 80, qty: 1 }, { name: '起司蛋糕', price: 120, qty: 2 }]
  assert.equal(calcOrderTotal(items, 'LATTE10'), 288)
})

test('金額四捨五入到整數', () => {
  // 105 × 0.9 = 94.5
  assert.equal(calcOrderTotal([{ name: '季節特調', price: 105, qty: 1 }], 'LATTE10'), 95)
})

test('數量不是正整數時丟出 RangeError', () => {
  for (const qty of [0, -1, 1.5]) {
    assert.throws(() => calcOrderTotal([{ name: '拿鐵', price: 110, qty }]), RangeError, `qty ${qty}`)
  }
})
