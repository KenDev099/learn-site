// 練習 3：這份測試全部通過，可是 menu-price.ts 明明有 bug。執行：node --test broken.spec.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchMenuPrice } from './menu-price.ts'

test('拿鐵的價格是 110', async () => {
  assert.equal(await fetchMenuPrice('拿鐵'), 110)
})

test('菜單上沒有的品項要丟出錯誤', async () => {
  await assert.rejects(fetchMenuPrice('珍珠奶茶'), /珍珠奶茶/)
})
