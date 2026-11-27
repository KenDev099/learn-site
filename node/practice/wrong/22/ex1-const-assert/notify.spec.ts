// 練習 1：為 notify.ts 寫測試。執行：node --test notify.spec.ts
// 規則：整個檔案要在 3 秒內跑完，所以不能真的等 30 秒，要用假時鐘
import test, { mock, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { GIVE_UP_MS, INTERVAL_MS, notifyWhenReady, type NotifyDeps, type OrderStatus } from './notify.ts'

// 假的依賴：getStatus 預設一直回 'pending'，每個函式都是 mock.fn，事後可以數被呼叫幾次
function fakeDeps() {
  return {
    getStatus: mock.fn(async (_orderId: number): Promise<OrderStatus> => 'pending'),
    sendSms: mock.fn(async (_orderId: number) => {}),
    log: { warn: mock.fn((_message: string) => {}) },
  } satisfies NotifyDeps
}

// 讓假時鐘往前走 ms 毫秒：一次走 1 秒，走之前和每走一步之後都讓排隊中的 Promise 跑完
// （setImmediate 沒有被假時鐘接管，用它等一輪，await 之後的程式才有機會執行、排下一個計時器）
async function advance(t: TestContext, ms: number) {
  await new Promise(resolve => setImmediate(resolve))
  for (let passed = 0; passed < ms; passed += 1000) {
    t.mock.timers.tick(1000)
    await new Promise(resolve => setImmediate(resolve))
  }
}

test('一開始就 ready：立刻傳一次簡訊，回傳 true', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()
  deps.getStatus.mock.mockImplementation(async () => 'ready')

  const done = notifyWhenReady(7, deps)

  assert.equal(await done, true)
  assert.equal(deps.sendSms.mock.callCount(), 1)
  assert.deepEqual(deps.sendSms.mock.calls[0].arguments, [7])
})

test('第 3 次查到 ready：傳一次簡訊', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()
  let calls = 0
  deps.getStatus.mock.mockImplementation(async () => ++calls >= 3 ? 'ready' : 'pending')
  const done = notifyWhenReady(7, deps)
  await advance(t, 5 * 60_000)
  assert.equal(await done, true)
  assert.equal(deps.sendSms.mock.callCount(), 1)
})

// 只檢查常數，沒有檢查程式真的照常數做
test('間隔是 30 秒', () => { assert.equal(INTERVAL_MS, 30_000) })
test('10 分鐘放棄', () => { assert.equal(GIVE_UP_MS, 600_000) })
test('查詢丟錯：下一輪繼續查', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()
  deps.getStatus.mock.mockImplementationOnce(async () => { throw new Error('連不上') }, 0)
  deps.getStatus.mock.mockImplementationOnce(async () => 'ready', 1)
  const done = notifyWhenReady(7, deps)
  await advance(t, 30_000)
  assert.equal(await done, true)
})
