// 練習 3：這份測試全部通過，可是 menu-price.ts 明明有 bug。執行：node --test broken.spec.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchMenuPrice } from './menu-price.ts'

test('拿鐵的價格是 110', () => {
  const price = fetchMenuPrice('拿鐵')
  assert.ok(price, '要查得到價格')
})

test('菜單上沒有的品項要丟出錯誤', async () => {
  try {
    await fetchMenuPrice('珍珠奶茶')
  } catch (err) {
    assert.match((err as Error).message, /珍珠奶茶/)
  }
})
