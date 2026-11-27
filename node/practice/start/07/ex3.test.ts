import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Drain = (items: number[], handle: (item: number) => void) => Promise<void>

// 模擬每筆通知要花 1ms 的 CPU：600 筆約 600ms
function busy(ms: number) {
  const end = performance.now() + ms
  while (performance.now() < end) {}
}

test('處理期間 /health 仍能回應，處理結果與順序不變', opts, async () => {
  const mod: { drainQueue?: unknown } = await import('./drain-queue.ts')
  assert.equal(typeof mod.drainQueue, 'function', 'drain-queue.ts 要 export drainQueue')
  const drainQueue = mod.drainQueue as Drain

  const { url } = await listen(createServer((req, res) => res.end('ok')))
  await (await fetch(`${url}/health`)).text()   // 先暖身一次，第一次連線比較慢

  const items = Array.from({ length: 600 }, () => Math.floor(Math.random() * 1_000_000))
  const expected = [...items]
  const seen: number[] = []
  let health: Promise<string> | undefined
  let start = 0
  // 處理到第 20 筆時才送出 /health：確定是「處理期間」的請求，先等一段時間再一口氣處理完的寫法擋得下來
  const done = drainQueue(items, item => {
    busy(1)
    seen.push(item)
    if (seen.length === 20) {
      start = performance.now()
      health = fetch(`${url}/health`).then(r => r.text())
    }
  })
  assert.ok(done instanceof Promise, 'drainQueue 要回傳 Promise')
  let finished = false
  void done.then(() => { finished = true })
  while (!health && !finished) await new Promise(r => setImmediate(r))
  assert.ok(health, '第 20 筆之前就卡住了：drainQueue 要處理每一筆')
  assert.equal(await health, 'ok')
  const elapsed = performance.now() - start
  const processedWhenHealthy = seen.length - 20
  await done

  // 用「回應時又處理了幾筆」判斷，不直接比時間：電腦忙的時候時間會飄，筆數不會
  assert.ok(processedWhenHealthy < items.length / 2, `/health 在第 20 筆送出，等到又處理了 ${processedWhenHealthy} 筆（約 ${Math.round(elapsed)}ms）才回應，要在處理不到一半時就回應。遞迴的 process.nextTick、queueMicrotask、Promise.then 都會在進入下一個 phase 前清空，event loop 到不了 poll；改用 setImmediate，讓每一筆之間走完一輪 loop。也不要一口氣同步處理完`)
  assert.deepEqual(items, expected, '不要改到傳進來的 items 陣列')
  assert.deepEqual(seen, expected, '每一筆都要處理到，順序和原本一樣，而且 Promise 要在全部處理完才完成')
})

test('空的佇列：Promise 直接完成', opts, async () => {
  const mod: { drainQueue?: unknown } = await import('./drain-queue.ts')
  assert.equal(typeof mod.drainQueue, 'function', 'drain-queue.ts 要 export drainQueue')
  let calls = 0
  await (mod.drainQueue as Drain)([], () => { calls++ })
  assert.equal(calls, 0, '沒有通知時不要呼叫 handle')
})
