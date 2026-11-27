import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { listen } from '../../helpers/http.ts'
import { OrderStore } from './orders.ts'

const opts = { timeout: 15_000 }

async function start(delayMs = 0) {
  const mod: { createApp?: unknown } = await import('./idempotent-create.ts')
  assert.equal(typeof mod.createApp, 'function', 'idempotent-create.ts 要 export createApp(store)')
  const store = new OrderStore({ delayMs })
  const { url } = await listen((mod.createApp as (s: OrderStore) => Server)(store))
  return { url, store }
}

// 標頭值照草案的寫法加上雙引號
const key = () => `"${randomUUID()}"`
async function post(url: string, body: unknown, idemKey?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (idemKey) headers['idempotency-key'] = idemKey
  const res = await fetch(url + '/orders', { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: res.status, location: res.headers.get('location'), type: res.headers.get('content-type') ?? '', body: await res.json() as Record<string, unknown> }
}

test('同一個 key、同樣內容送兩次：只建立一筆，第二次回第一次的結果', opts, async () => {
  const { url, store } = await start()
  const k = key()
  const qty = 1 + Math.floor(Math.random() * 20)
  const first = await post(url, { drink: '拿鐵', qty }, k)
  assert.equal(first.status, 201)
  const second = await post(url, { drink: '拿鐵', qty }, k)
  assert.equal(store.all().length, 1, `同一個 key 重送，訂單數要維持 1，現在是 ${store.all().length}：重送不能再建立一筆`)
  assert.equal(second.status, 201, '重送要回第一次的狀態碼 201')
  assert.deepEqual(second.body, first.body, '重送要回第一次的 body（同一筆訂單）')
  assert.equal(second.location, first.location, '重送也要帶同樣的 Location')
})

test('同一個 key、不同內容：422 problem+json，不建立', opts, async () => {
  const { url, store } = await start()
  const k = key()
  await post(url, { drink: '拿鐵', qty: 1 }, k)
  for (const other of [{ drink: '拿鐵', qty: 2 }, { drink: '美式咖啡', qty: 1 }]) {
    const res = await post(url, other, k)
    assert.equal(res.status, 422, `key 用過了但內容不同（${JSON.stringify(other)}）要回 422，不能回第一次的結果。收到 ${res.status}`)
    assert.match(res.type, /^application\/problem\+json\b/, '422 要是 problem+json')
  }
  assert.equal(store.all().length, 1)
})

test('同一個 key 的兩個請求同時到達：一個 201，另一個 409（第一個還在處理中）', opts, async () => {
  const { url, store } = await start(300)
  const k = key()
  const results = await Promise.all([post(url, { drink: '卡布奇諾', qty: 2 }, k), post(url, { drink: '卡布奇諾', qty: 2 }, k)])
  const statuses = results.map(r => r.status).sort()
  assert.deepEqual(statuses, [201, 409], `要一個 201、一個 409，收到 ${statuses.join('、')}。檢查 key 和記下 key 之間不能有 await，不然兩個請求都會以為自己是第一個`)
  assert.equal(store.all().length, 1, '並發的兩個請求只能建立一筆')
  const conflict = results.find(r => r.status === 409)
  assert.match(conflict?.type ?? '', /^application\/problem\+json\b/, '409 要是 problem+json')
  const later = await post(url, { drink: '卡布奇諾', qty: 2 }, k)
  assert.equal(later.status, 201, '第一個完成之後再重送，要回第一次的結果')
  assert.equal(store.all().length, 1)
})

test('不同的 key 各自建立；沒帶 key 每次都建立', opts, async () => {
  const { url, store } = await start()
  const a = await post(url, { drink: '拿鐵', qty: 1 }, key())
  const b = await post(url, { drink: '拿鐵', qty: 1 }, key())
  assert.equal(a.status, 201)
  assert.equal(b.status, 201)
  assert.notEqual(a.body.id, b.body.id, '不同的 key 是不同的請求，要各自建立')
  await post(url, { drink: '拿鐵', qty: 1 })
  await post(url, { drink: '拿鐵', qty: 1 })
  assert.equal(store.all().length, 4, '沒帶 Idempotency-Key 的請求照常建立')
})

test('第一次建立失敗（500）：要放掉 key，客戶端用同一個 key 重試要能成功', opts, async () => {
  const mod: { createApp?: unknown } = await import('./idempotent-create.ts')
  assert.equal(typeof mod.createApp, 'function', 'idempotent-create.ts 要 export createApp(store)')
  // 第一次寫入失敗（例如資料庫斷線），之後恢復正常
  class FlakyStore extends OrderStore {
    failures = 1
    override async create(input: { drink: string, qty: number }) {
      if (this.failures-- > 0) throw new Error('模擬資料庫斷線')
      return super.create(input)
    }
  }
  const store = new FlakyStore()
  const { url } = await listen((mod.createApp as (s: OrderStore) => Server)(store))
  const k = key()
  const original = console.error
  console.error = () => {}   // withErrors 會印出模擬的錯誤，這裡不需要看
  try {
    const first = await post(url, { drink: '拿鐵', qty: 1 }, k)
    assert.equal(first.status, 500, '寫入失敗要回 500')
  } finally {
    console.error = original
  }
  const retry = await post(url, { drink: '拿鐵', qty: 1 }, k)
  assert.equal(retry.status, 201, `失敗之後用同一個 key 重試要能建立，收到 ${retry.status}。建立失敗時要把佔住的 key 刪掉，不然這個 key 永遠卡在「處理中」`)
  assert.equal(store.all().length, 1)
})
