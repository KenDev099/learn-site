import test from 'node:test'
import assert from 'node:assert/strict'
import { calcOrderTotal } from './order-total.ts'

test('t1', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 1 }], 'LATTE10') })
test('t2', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 2 }], 'LATTE10') })
test('t3', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 3 }], 'LATTE10') })
test('t4', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 4 }], 'LATTE10') })
test('t5', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 5 }], 'LATTE10') })
test('t6', () => { calcOrderTotal([{ name: 'x', price: 110, qty: 6 }], 'LATTE10') })
