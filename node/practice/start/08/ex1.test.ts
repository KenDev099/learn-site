import test from 'node:test'
import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { OrderBoard, type Order } from './order-board.ts'

const opts = { timeout: 15_000 }
type Wait = (board: OrderBoard, orderId: number, o: { signal?: AbortSignal, timeoutMs: number }) => Promise<Order>

// 記下 waitForReady 呼叫當下用 setTimeout 開的計時器：結束時每一個都要已經觸發或被 clearTimeout
// （unref 過的計時器不撐住程序，process.getActiveResourcesInfo() 看不到，所以另外記）
const timers = new Set<unknown>()
const realClear = globalThis.clearTimeout
globalThis.clearTimeout = ((t?: Parameters<typeof clearTimeout>[0]) => { timers.delete(t); realClear(t) }) as typeof clearTimeout
async function load() {
  const mod: { waitForReady?: unknown } = await import('./wait-for-ready.ts')
  assert.equal(typeof mod.waitForReady, 'function', 'wait-for-ready.ts 要 export waitForReady')
  const fn = mod.waitForReady as Wait
  return ((board, orderId, o) => {
    const realSet = globalThis.setTimeout
    const patchedSet = ((cb: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      const t: unknown = realSet((...a: unknown[]) => { timers.delete(t); cb(...a) }, ms, ...args)
      timers.add(t)
      return t
    }) as typeof setTimeout
    globalThis.setTimeout = patchedSet
    try {
      return fn(board, orderId, o)
    } finally {
      globalThis.setTimeout = realSet
    }
  }) as Wait
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const randomId = () => 1000 + Math.floor(Math.random() * 9000)
// 在 ms 內要有結果，不然當成「一直在等」
async function settle<T>(p: Promise<T>, ms: number, msg: string) {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms) })
  try {
    return await Promise.race([p.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })), late])
  } finally { clearTimeout(timer) }
}
function assertClean(board: OrderBoard, signal?: AbortSignal) {
  assert.equal(board.listenerCount('ready'), 0, '結束之後 board 上的 ready 監聽器要用 off 移除（每一種結果都要：做好、逾時、取消）')
  if (signal) assert.equal(getEventListeners(signal, 'abort').length, 0, '結束之後要把掛在 signal 上的 abort 監聽器移除')
  assert.ok(timers.size === 0 && !process.getActiveResourcesInfo().includes('Timeout'), '結束之後還有計時器沒清掉：逾時用的 setTimeout 要 clearTimeout（unref 只是不撐住程序，計時器還在，時間到還是會執行）')
}

test('別張訂單先做好不能 resolve；等到自己的訂單才 resolve，然後什麼都不留', opts, async () => {
  const waitForReady = await load()
  const board = new OrderBoard()
  const id = randomId()
  const ac = new AbortController()
  const p = waitForReady(board, id, { signal: ac.signal, timeoutMs: 5_000 })
  let done = false
  p.then(() => { done = true }, () => { done = true })
  setTimeout(() => board.ready({ id: id + 1, item: '拿鐵' }), 10)
  await sleep(40)
  assert.equal(done, false, `訂單 ${id + 1} 做好時就結束了：要比對 order.id，不是第一個 ready 就收`)
  await sleep(160)
  assert.equal(done, false, `timeoutMs 是 5000，200ms 就結束了：逾時要用傳進來的 timeoutMs`)
  const mine = { id, item: '卡布奇諾' }
  board.ready(mine)
  const r = await settle(p, 1_000, '自己的訂單做好了卻沒有 resolve')
  assert.ok(r.ok, `自己的訂單做好了卻 reject：${r.ok ? '' : String(r.error)}`)
  assert.equal(r.value, mine, 'resolve 的值要是做好的那張訂單')
  assertClean(board, ac.signal)
})

test('逾時：照 timeoutMs 計時，reject 名稱為 TimeoutError 的錯誤，並清乾淨', opts, async () => {
  const waitForReady = await load()
  const board = new OrderBoard()
  const ac = new AbortController()
  const short = 60 + Math.floor(Math.random() * 30)
  const long = short + 160
  const start = performance.now()
  const waits = [short, long].map(async ms => {
    const r = await settle(waitForReady(board, randomId(), { signal: ac.signal, timeoutMs: ms }), 2_000, `timeoutMs 是 ${ms}，2 秒後還在等：要自己設逾時`)
    return { ms, r, elapsed: performance.now() - start }
  })
  for (const { ms, r, elapsed } of await Promise.all(waits)) {
    assert.equal(r.ok, false, '逾時要 reject')
    if (!r.ok) assert.equal((r.error as Error)?.name, 'TimeoutError', '逾時的錯誤 name 要是 TimeoutError，呼叫端才分得出是逾時還是被取消')
    assert.ok(elapsed >= ms - 5, `timeoutMs 是 ${ms}，卻在 ${Math.round(elapsed)}ms 就放棄了`)
    assert.ok(elapsed < ms + 120, `timeoutMs 是 ${ms}，卻等到 ${Math.round(elapsed)}ms 才逾時：要用傳進來的 timeoutMs`)
  }
  assertClean(board, ac.signal)
})

test('等到一半被取消：reject signal.reason，並清乾淨', opts, async () => {
  const waitForReady = await load()
  const board = new OrderBoard()
  const ac = new AbortController()
  const reason = new Error(`客人取消 ${randomId()}`)
  const p = waitForReady(board, randomId(), { signal: ac.signal, timeoutMs: 5_000 })
  setTimeout(() => ac.abort(reason), 20)
  const r = await settle(p, 1_000, 'signal 取消了還在等：要監聽 signal 的 abort 事件')
  assert.equal(r.ok, false, '取消要 reject')
  if (!r.ok) assert.equal(r.error, reason, '取消時 reject 的要是 signal.reason 本身')
  assertClean(board, ac.signal)
})

test('signal 一開始就取消了：立刻 reject signal.reason，不掛任何監聽器', opts, async () => {
  const waitForReady = await load()
  const board = new OrderBoard()
  const reason = new Error(`請求早就結束了 ${randomId()}`)
  const signal = AbortSignal.abort(reason)
  const r = await settle(waitForReady(board, randomId(), { signal, timeoutMs: 3_000 }), 500, 'signal 已經取消了還在等：abort 事件已經發生過、不會再來，要先檢查 signal.aborted')
  assert.equal(r.ok, false, '已取消的 signal 要立刻 reject')
  if (!r.ok) assert.equal(r.error, reason, '要 reject signal.reason，不是等到逾時')
  assertClean(board, signal)
})

test('沒有傳 signal 也能用', opts, async () => {
  const waitForReady = await load()
  const board = new OrderBoard()
  const id = randomId()
  const p = waitForReady(board, id, { timeoutMs: 5_000 })
  board.ready({ id, item: '美式咖啡' })
  const r = await settle(p, 1_000, '沒有 signal 時，訂單做好了卻沒有 resolve')
  assert.ok(r.ok, `沒有 signal 時要正常運作：${r.ok ? '' : String(r.error)}`)
  assertClean(board)
})
