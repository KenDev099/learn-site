import test from 'node:test'
import assert from 'node:assert/strict'
import { calcOrderTotal } from './order-total.ts'

test('80 元', () => { assert.equal(calcOrderTotal([{ name: 'x', price: 80, qty: 1 }]), 80) })
test('110 元', () => { assert.equal(calcOrderTotal([{ name: 'x', price: 110, qty: 1 }]), 110) })
test('90 元', () => { assert.equal(calcOrderTotal([{ name: 'x', price: 90, qty: 1 }]), 90) })
test('70 元', () => { assert.equal(calcOrderTotal([{ name: 'x', price: 70, qty: 1 }]), 70) })
test('120 元', () => { assert.equal(calcOrderTotal([{ name: 'x', price: 120, qty: 1 }]), 120) })
