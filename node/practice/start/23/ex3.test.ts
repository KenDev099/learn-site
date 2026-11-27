import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { EventEmitter } from 'node:events'
import { run } from '../../helpers/proc.ts'
import { tmpProject } from '../../helpers/tmp.ts'

type Cache = { get(key: string): unknown, set(key: string, value: unknown): void, readonly size: number }
type CacheClass = new (options: { max: number, ttlMs: number, now?: () => number }) => Cache
type Order = { id: string, customer: string, items: { product: string, qty: number }[], note: string }
type Load = (id: string, signal: AbortSignal) => Promise<Order>
type CreateHandler = (deps: { load: Load, now?: () => number }) => (id: string) => Promise<Order>

const opts = { timeout: 15_000 }
const word = () => Math.random().toString(36).slice(2, 8)

async function loadLRU() {
  const mod: { LRU?: unknown } = await import('./lru.ts')
  assert.equal(typeof mod.LRU, 'function', 'lru.ts 要 export class LRU')
  return mod.LRU as CacheClass
}

async function loadHandler() {
  const mod: { createHandler?: unknown, orderEvents?: unknown } = await import('./handler.ts')
  assert.equal(typeof mod.createHandler, 'function', 'handler.ts 要 export createHandler')
  assert.ok(mod.orderEvents && typeof (mod.orderEvents as EventEmitter).listenerCount === 'function', 'handler.ts 要 export orderEvents（EventEmitter）')
  return { createHandler: mod.createHandler as CreateHandler, orderEvents: mod.orderEvents as EventEmitter }
}

const order = (id: string): Order => ({ id, customer: '王小明', items: [{ product: '拿鐵', qty: 1 }], note: '' })

test('LRU：放第 max + 1 筆時淘汰最久沒用的；get 和 set 都算「用」', opts, async () => {
  const LRU = await loadLRU()
  for (const max of [3, 500]) {
    const keys = Array.from({ length: max + 1 }, () => word())
    const cache = new LRU({ max, ttlMs: 60_000, now: () => 0 })
    for (const k of keys.slice(0, max)) cache.set(k, k.toUpperCase())
    assert.equal(cache.size, max, `放了 ${max} 筆，size 要是 ${max}`)
    assert.equal(cache.get(keys[0]), keys[0].toUpperCase(), '還沒滿的時候，每一筆都要拿得到')
    cache.set(keys[max], 'new')   // keys[0] 剛被讀過，最久沒用的是 keys[1]
    assert.equal(cache.size, max, `放第 ${max + 1} 筆之後，size 還是 ${max}`)
    assert.equal(cache.get(keys[1]), undefined, '最久沒用的那一筆要被淘汰')
    assert.equal(cache.get(keys[0]), keys[0].toUpperCase(), 'get 讀過的要算「最近用過」，不能被淘汰；不能一滿就整個清空')
    assert.equal(cache.get(keys[max]), 'new')
    cache.set(keys[2], 'again')   // 重新 set 也算用過
    cache.set(word(), 'x')
    assert.equal(cache.get(keys[2]), 'again', 'set 一個已經存在的 key 要更新值，也算「最近用過」')
  }
})

test('LRU：存進去滿 ttlMs 就過期（用注入的 now）', opts, async () => {
  const LRU = await loadLRU()
  let t = 1_000_000 + Math.floor(Math.random() * 1000)
  const cache = new LRU({ max: 10, ttlMs: 60_000, now: () => t })
  const k = word()
  cache.set(k, 'v')
  t += 59_999
  assert.equal(cache.get(k), 'v', '還沒滿 60 秒，要拿得到')
  t += 1
  assert.equal(cache.get(k), undefined, '滿 60 秒（now() - 存入時間 >= ttlMs）要回傳 undefined；時間要用 now()，不是 Date.now()')
  assert.equal(cache.size, 0, '過期的那一筆要刪掉')
})

test('getOrder：快取命中不再查詢；最多 500 筆；60 秒後重新查詢', opts, async () => {
  const { createHandler } = await loadHandler()
  let t = 5_000_000
  const calls: string[] = []
  const getOrder = createHandler({ load: async id => { calls.push(id); return order(id) }, now: () => t })
  const ids = Array.from({ length: 501 }, (_, i) => `${word()}-${i}`)
  assert.equal((await getOrder(ids[0])).id, ids[0])
  await getOrder(ids[0])
  assert.equal(calls.length, 1, '同一個 id 第二次要從快取拿，不能再呼叫 load')
  for (const id of ids.slice(1)) await getOrder(id)
  calls.length = 0
  await getOrder(ids[500])
  assert.equal(calls.length, 0, '剛放進去的要還在快取裡')
  await getOrder(ids[0])
  assert.equal(calls.length, 1, '放了 501 個不同的 id，最久沒用的第一個要被淘汰：快取要改用 LRU（max 500）')
  t += 60_000
  await getOrder(ids[500])
  assert.equal(calls.length, 2, '60 秒後要重新查詢：TTL 60 秒，時間用傳進來的 now')
})

test('getOrder：成功或失敗之後，shutdown 監聽器都要移除；關機時仍能取消進行中的查詢', opts, async () => {
  const { createHandler, orderEvents } = await loadHandler()
  const before = orderEvents.listenerCount('shutdown')
  const getOrder = createHandler({
    load: async id => {
      if (id.startsWith('bad')) throw new Error(`查不到 ${id}`)
      return order(id)
    },
  })
  for (let i = 0; i < 30; i++) await getOrder(`ok-${word()}`)
  assert.equal(orderEvents.listenerCount('shutdown'), before, '查詢成功之後，shutdown 的監聽器要移除（off）')
  for (let i = 0; i < 30; i++) {
    const id = `bad-${word()}`
    await assert.rejects(getOrder(id), { message: `查不到 ${id}` }, 'load 丟出的錯誤要原樣往外丟')
  }
  assert.equal(orderEvents.listenerCount('shutdown'), before,
    '查詢失敗之後也要移除監聽器：用 try/finally。once 也不行，shutdown 沒發生的話監聽器一直留著')

  const slow = createHandler({
    load: (_id, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  })
  const pending = slow(`slow-${word()}`)
  await new Promise(r => setImmediate(r))
  assert.equal(orderEvents.listenerCount('shutdown'), before + 1, '查詢進行中要有一個 shutdown 監聽器（不能整個拿掉）')
  orderEvents.emit('shutdown')
  await assert.rejects(pending, '關機時進行中的查詢要被取消')
  assert.equal(orderEvents.listenerCount('shutdown'), before)
})

test('2 萬個不同 id 的請求之後，GC 後的 heapUsed 增加不到 5MB', opts, async () => {
  await loadHandler()   // 先確認檔案能載入
  const handler = pathToFileURL(join(import.meta.dirname, 'handler.ts')).href
  const dir = await tmpProject({
    'drive.mjs': `
const { createHandler, orderEvents } = await import(${JSON.stringify(handler)})
const note = '請少冰、半糖、外帶'.repeat(20)
const getOrder = createHandler({
  load: async id => {
    if (id.endsWith('7')) throw new Error('db timeout')
    return { id, customer: '王小明', items: Array.from({ length: 5 }, (_, i) => ({ product: '拿鐵', qty: i + 1 })), note: note + id }
  },
})
async function round(from, n) {
  for (let i = from; i < from + n; i++) { try { await getOrder('o' + i) } catch {} }
}
await round(0, 2000)
globalThis.gc(); globalThis.gc()
const before = process.memoryUsage().heapUsed
await round(2000, 20000)
globalThis.gc(); globalThis.gc()
const after = process.memoryUsage().heapUsed
console.log(JSON.stringify({ growthMB: (after - before) / 1048576, listeners: orderEvents.listenerCount('shutdown') }))
`,
  })
  const r = await run(process.execPath, ['--expose-gc', '--no-warnings', join(dir, 'drive.mjs')], { cwd: dir, timeoutMs: 12_000 })
  assert.equal(r.code, 0, `量測程式執行失敗：${r.stderr.slice(0, 500)}`)
  const { growthMB, listeners } = JSON.parse(r.stdout.trim().split('\n').at(-1) ?? '{}')
  assert.equal(listeners, 0, `2 萬個請求之後還掛著 ${listeners} 個 shutdown 監聽器`)
  assert.ok(growthMB < 5, `GC 之後 heapUsed 還多了 ${growthMB.toFixed(1)}MB（要小於 5MB）：快取要有上限，監聽器要移除`)
})
