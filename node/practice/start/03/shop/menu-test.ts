// npm test 會跑這個測試（練習 1）。檔名 *-test.ts 是 node --test 預設會找的名字之一
import test from 'node:test'
import assert from 'node:assert/strict'
import { menu } from './menu.ts'

test('菜單有 6 樣商品，價格都是正整數', () => {
  assert.equal(menu.length, 6)
  for (const item of menu) assert.ok(Number.isInteger(item.price) && item.price > 0, item.name)
})
