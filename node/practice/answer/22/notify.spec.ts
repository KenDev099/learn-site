// 練習 1：為 notify.ts 寫測試。執行：node --test notify.spec.ts
// 規則：整個檔案要在 3 秒內跑完，所以不能真的等 30 秒，要用假時鐘
import test, { mock, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { notifyWhenReady, type NotifyDeps, type OrderStatus } from './notify.ts'

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

test('還沒 ready：每 30 秒查一次，不會更頻繁', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()

  notifyWhenReady(7, deps)
  await advance(t, 0)
  assert.equal(deps.getStatus.mock.callCount(), 1, '一開始查 1 次')
  await advance(t, 29_000)
  assert.equal(deps.getStatus.mock.callCount(), 1, '29 秒時還不能查第 2 次')
  await advance(t, 1_000)
  assert.equal(deps.getStatus.mock.callCount(), 2, '30 秒時查第 2 次')
  await advance(t, 60_000)
  assert.equal(deps.getStatus.mock.callCount(), 4, '90 秒時一共查 4 次')
  t.mock.timers.runAll()
})

test('第 3 次查到 ready：只傳一次簡訊，之後不再查', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()
  let calls = 0
  deps.getStatus.mock.mockImplementation(async () => ++calls >= 3 ? 'ready' : 'pending')

  const done = notifyWhenReady(7, deps)
  await advance(t, 5 * 60_000)

  assert.equal(await done, true)
  assert.equal(deps.sendSms.mock.callCount(), 1, 'ready 之後只能傳一次')
  assert.equal(deps.getStatus.mock.callCount(), 3, 'ready 之後不再查')
  assert.equal(deps.log.warn.mock.callCount(), 0)
})

test('10 分鐘還沒 ready：log.warn 一次、回傳 false、不再查', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()

  const done = notifyWhenReady(7, deps)
  await advance(t, 10 * 60_000)

  assert.equal(await done, false)
  assert.equal(deps.log.warn.mock.callCount(), 1)
  assert.equal(deps.sendSms.mock.callCount(), 0)
  const checks = deps.getStatus.mock.callCount()
  await advance(t, 5 * 60_000)
  assert.equal(deps.getStatus.mock.callCount(), checks, '放棄之後不能再查')
})

test('查詢丟錯：下一輪繼續查，ready 時照樣通知', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const deps = fakeDeps()
  deps.getStatus.mock.mockImplementationOnce(async () => { throw new Error('連不上') }, 0)
  deps.getStatus.mock.mockImplementationOnce(async () => 'ready', 1)

  const done = notifyWhenReady(7, deps)
  await advance(t, 30_000)

  assert.equal(await done, true)
  assert.equal(deps.sendSms.mock.callCount(), 1)
})
