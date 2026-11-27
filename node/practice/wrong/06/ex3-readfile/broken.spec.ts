import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchMenuPrice } from './menu-price.ts'

const source = readFileSync(new URL('./menu-price.ts', import.meta.url), 'utf8')

test('拿鐵的價格是 110', async () => {
  assert.equal(await fetchMenuPrice('拿鐵'), 110)
})

test('查不到要丟錯', () => {
  assert.match(source, /throw/)
})
