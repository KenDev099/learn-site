// 練習 3：這個測試檔有時過、有時不過。修好它。執行：node --test flaky.spec.ts
// 判分會用 --test-randomize 打亂順序跑好幾次、兩份同時跑、在另一個時區的凌晨跑，全部都要通過
import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp, receiptTitle, startBrewing, store } from './pickup.ts'

test('第一張訂單的編號是 1', () => {
  const order = store.add('拿鐵')
  assert.equal(order.id, 1)
})

test('櫃台上有 1 張訂單', () => {
  assert.equal(store.all().length, 1)
})

test('沖煮 2 秒後變成 ready', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const order = store.add('美式咖啡')
  startBrewing(order)
  t.mock.timers.tick(2000)
  assert.equal(order.status, 'ready')
})

test('收據標題是今天的日期', () => {
  assert.equal(receiptTitle(), `收據 ${new Date().toISOString().slice(0, 10)}`)
})

test('查不到的訂單回 404', async () => {
  const server = createApp().listen(3000)
  const res = await fetch('http://localhost:3000/orders/999')
  assert.equal(res.status, 404)
  server.close()
})
