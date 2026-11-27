import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const opts = { timeout: 15_000 }
type Order = { id: number, item: string }
type Consume = (feed: EventEmitter, o: { signal?: AbortSignal, handle: (order: Order) => Promise<void> }) => Promise<number>

async function load() {
  const mod: { consumeOrders?: unknown } = await import('./order-feed.ts')
  assert.equal(typeof mod.consumeOrders, 'function', 'order-feed.ts 要 export consumeOrders')
  return mod.consumeOrders as Consume
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const items = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
const makeOrders = (n: number) => {
  const base = Math.floor(Math.random() * 10_000)
  return Array.from({ length: n }, (_, i) => ({ id: base + i, item: items[Math.floor(Math.random() * items.length)] }))
}
// 記錄 handle 的呼叫順序與同時進行的數量
function recorder(ms = 30, failOn?: number, err?: Error) {
  const r = { seen: [] as Order[], active: 0, maxActive: 0, handle: async (order: Order) => {
    r.active++
    r.maxActive = Math.max(r.maxActive, r.active)
    r.seen.push(order)
    try {
      await sleep(ms)
      if (order.id === failOn) throw err
    } finally { r.active-- }
  } }
  return r
}
async function settle<T>(p: Promise<T>, ms: number, msg: string) {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(msg)), ms) })
  try {
    return await Promise.race([p.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error })), late])
  } finally { clearTimeout(timer) }
}
function assertClean(feed: EventEmitter) {
  for (const name of ['order', 'error', 'closed']) {
    assert.equal(feed.listenerCount(name), 0, `結束之後 feed 上還有 ${feed.listenerCount(name)} 個 ${name} 監聽器：不論怎麼結束都要移除（events.on 會自己清，自己掛的要自己 off）`)
  }
}

test('一口氣來好幾筆：依序一次處理一筆；closed 後回傳處理的筆數', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const orders = makeOrders(6 + Math.floor(Math.random() * 3))
  const r = recorder()
  const p = consumeOrders(feed, { handle: r.handle })
  for (const o of orders) feed.emit('order', o)
  feed.emit('closed')
  const res = await settle(p, 3_000, 'emit(\'closed\') 之後 3 秒還沒結束：要把 closed 當成「結束」，例如 events.on 的 close 選項')
  assert.equal(r.maxActive, 1, `同時有 ${r.maxActive} 個 handle 在跑：一次只能處理一筆，前一筆的 await handle 結束才開始下一筆。async 監聽器不會讓 emit 等它`)
  assert.deepEqual(r.seen, orders, '每一筆都要處理，順序和收到的一樣')
  assert.ok(res.ok, `closed 之後要正常結束：${res.ok ? '' : String(res.error)}`)
  assert.equal(res.value, orders.length, `收到 ${orders.length} 筆，要回傳實際處理了幾筆`)
  assertClean(feed)
})

test('feed emit error：以那個錯誤 reject', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const r = recorder(5)
  const err = new Error(`外送平台斷線 ${Math.random()}`)
  const p = consumeOrders(feed, { handle: r.handle })
  feed.emit('order', makeOrders(1)[0])
  setTimeout(() => {
    try { feed.emit('error', err) } catch { /* 沒人監聽 error 時 emit 會 throw，交給下面的斷言 */ }
  }, 30)
  const res = await settle(p, 2_000, 'feed emit(\'error\') 之後 2 秒還沒結束：error 事件要讓 consumeOrders reject')
  assert.equal(res.ok, false, 'error 事件要讓 consumeOrders reject')
  if (!res.ok) assert.equal(res.error, err, 'reject 的要是 feed 發出的那個錯誤')
  assertClean(feed)
})

test('handle 丟錯：停止處理並以那個錯誤 reject', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const orders = makeOrders(4)
  const err = new Error(`庫存不足 ${orders[1].item}`)
  const r = recorder(10, orders[1].id, err)
  const p = consumeOrders(feed, { handle: r.handle })
  for (const o of orders) feed.emit('order', o)
  const res = await settle(p, 2_000, 'handle 丟錯之後 2 秒還沒結束：handle 的錯誤要讓 consumeOrders reject')
  assert.equal(res.ok, false, 'handle 丟錯要讓 consumeOrders reject')
  if (!res.ok) assert.equal(res.error, err, 'reject 的要是 handle 丟出的錯誤')
  await sleep(50)
  assert.deepEqual(r.seen, orders.slice(0, 2), 'handle 失敗之後不能再處理下一筆')
  assertClean(feed)
})

test('signal 取消：正在處理的那筆做完就停，不開始下一筆，reject AbortError', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const orders = makeOrders(5)
  const r = recorder(30)
  const ac = new AbortController()
  const p = consumeOrders(feed, { signal: ac.signal, handle: r.handle })
  for (const o of orders) feed.emit('order', o)
  await sleep(45)   // 第 2 筆處理到一半
  ac.abort()
  const res = await settle(p, 1_000, 'signal 取消之後 1 秒還沒結束：要把 signal 交給 events.on，或自己監聽 abort')
  assert.equal(res.ok, false, 'signal 取消要讓 consumeOrders reject')
  if (!res.ok) assert.equal((res.error as Error)?.name, 'AbortError', '取消時 reject 的錯誤名稱要是 AbortError')
  assert.ok(r.seen.length <= 2, `取消之後又開始處理了 ${r.seen.length - 2} 筆：events.on 會把已經排在暫存裡的事件繼續交出來，每一筆開始前要檢查 signal（signal.throwIfAborted()）`)
  assertClean(feed)
})

test('沒有訂單、正在等下一筆時取消：馬上 reject AbortError', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const r = recorder(5)
  const ac = new AbortController()
  const p = consumeOrders(feed, { signal: ac.signal, handle: r.handle })
  feed.emit('order', makeOrders(1)[0])
  await sleep(40)   // 那一筆處理完了，迴圈在等下一筆
  ac.abort()
  const res = await settle(p, 1_000, '沒有新訂單時取消，1 秒後還在等：只在每一筆開始前檢查 signal 不夠，等下一筆的時候也要能被取消（把 signal 交給 events.on）')
  assert.equal(res.ok, false, 'signal 取消要讓 consumeOrders reject')
  if (!res.ok) assert.equal((res.error as Error)?.name, 'AbortError', '取消時 reject 的錯誤名稱要是 AbortError')
  assert.equal(r.seen.length, 1, '取消前收到的那一筆要處理')
  assertClean(feed)
})

test('signal 一開始就取消：一筆都不處理，reject AbortError', opts, async () => {
  const consumeOrders = await load()
  const feed = new EventEmitter()
  const r = recorder(5)
  const p = consumeOrders(feed, { signal: AbortSignal.abort(), handle: r.handle })
  feed.emit('order', makeOrders(1)[0])
  const res = await settle(p, 1_000, '已取消的 signal 傳進來，1 秒後還在等')
  assert.equal(res.ok, false, '已取消的 signal 要立刻 reject')
  if (!res.ok) assert.equal((res.error as Error)?.name, 'AbortError', '錯誤名稱要是 AbortError')
  assert.equal(r.seen.length, 0, '已取消就不能處理任何一筆')
  assertClean(feed)
})
