// 練習 3：這個測試檔有時過、有時不過。修好它。執行：node --test flaky.spec.ts
// 判分會用 --test-randomize 打亂順序跑好幾次、兩份同時跑、在另一個時區的凌晨跑，全部都要通過
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { BREW_MS, createApp, createStore, receiptTitle, startBrewing } from './pickup.ts'

// 每個測試自己建一份 store，不共用模組裡的那份
test('第一張訂單的編號是 1', () => {
  const store = createStore()
  assert.equal(store.add('拿鐵').id, 1)
  assert.equal(store.add('可頌').id, 2)
})

test('加了一張訂單，櫃台上就有 1 張', () => {
  const store = createStore()
  store.add('拿鐵')
  assert.equal(store.all().length, 1)
})

// 把真的等待搬到模組頂層：每個測試的時間很短，但整個檔案還是慢了 2 秒
const brewed = createStore().add('美式咖啡')
startBrewing(brewed)
await new Promise(resolve => setTimeout(resolve, BREW_MS + 100))
test('沖煮 2 秒後變成 ready', () => {
  assert.equal(brewed.status, 'ready')
})

// 時間從參數傳進去，預期值寫死：哪一天、哪個時區跑都一樣
test('收據標題是那一天的本地日期', () => {
  assert.equal(receiptTitle(new Date(2026, 0, 2, 1, 30)), '收據 2026-01-02')
  assert.equal(receiptTitle(new Date(2026, 9, 31, 23, 59)), '收據 2026-10-31')
})

// listen(0)：讓系統挑沒人用的 port；t.after 保證失敗時也會關掉
test('查不到的訂單回 404，查得到的回 200', async (t) => {
  const store = createStore()
  const order = store.add('拿鐵')
  const server = createApp(store).listen(0, '127.0.0.1')
  t.after(() => server.close())
  await once(server, 'listening')
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

  const missing = await fetch(`${base}/orders/999`)
  assert.equal(missing.status, 404)
  await missing.body?.cancel()
  const found = await fetch(`${base}/orders/${order.id}`)
  assert.equal(found.status, 200)
  assert.deepEqual(await found.json(), { id: order.id, item: '拿鐵', status: 'brewing' })
})
