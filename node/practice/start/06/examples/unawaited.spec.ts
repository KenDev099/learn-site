// 斷言放在沒有 await／return 的 then 裡：執行 node --test examples/unawaited.spec.ts 看看
import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'

async function fetchPrice() {
  await setTimeout(20)
  return 999   // 故意寫錯，應該是 110
}

test('拿鐵是 110 元', async () => {
  fetchPrice().then(price => assert.equal(price, 110))
})
