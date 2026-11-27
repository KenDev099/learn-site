import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'
import { OrderStore, type Order } from './orders.ts'
import { decodeCursor } from './cursor.ts'

const opts = { timeout: 15_000 }
type Page = { items: Order[], nextCursor: string | null }

// 時間由測試控制：clock.t 改了，之後建立的訂單就是那個時間
async function start() {
  const mod: { createApp?: unknown } = await import('./list-orders.ts')
  assert.equal(typeof mod.createApp, 'function', 'list-orders.ts 要 export createApp(store)')
  const clock = { t: Date.UTC(2026, 9, 31, 8) }
  const store = new OrderStore({ now: () => new Date(clock.t) })
  const { url } = await listen((mod.createApp as (s: OrderStore) => Server)(store))
  return { url, store, clock }
}

// 建立 n 筆，每 group 筆共用同一個 createdAt（同一秒進來好幾筆）。
// 時間故意跳來跳去（例如補登的訂單）：id 大的不一定比較新，只用 id 排序會錯
async function seed(store: OrderStore, clock: { t: number }, n: number, group: number) {
  const base = clock.t
  for (let i = 0; i < n; i++) {
    clock.t = base + ((Math.floor(i / group) * 7) % 11) * 1000
    await store.create({ drink: '拿鐵', qty: 1 + (i % 20) })
  }
  clock.t = base + 11_000
}

async function getPage(url: string, query: string): Promise<Page> {
  const res = await fetch(`${url}/orders${query}`)
  assert.equal(res.status, 200, `GET /orders${query} 要回 200，收到 ${res.status}`)
  const page = await res.json() as Page
  assert.ok(Array.isArray(page.items), '回應要是 { items, nextCursor }')
  assert.ok(page.nextCursor === null || typeof page.nextCursor === 'string', 'nextCursor 要是字串或 null')
  return page
}

async function readAll(url: string, limit: number, between?: () => Promise<void>) {
  const seen: Order[] = []
  let cursor: string | null = null
  for (let i = 0; i < 100; i++) {
    const page: Page = await getPage(url, `?limit=${limit}` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''))
    assert.ok(page.items.length <= limit, `一頁不能超過 limit=${limit} 筆`)
    seen.push(...page.items)
    if (i === 0 && between) await between()
    if (page.nextCursor === null) return seen
    assert.ok(page.items.length > 0, '還有 nextCursor 的頁面不應該是空的')
    const last = page.items.at(-1) as Order
    let decoded: unknown
    try { decoded = decodeCursor(page.nextCursor) } catch { decoded = page.nextCursor }
    assert.deepEqual(decoded, { createdAt: last.createdAt, id: last.id }, 'nextCursor 要用 encodeCursor 把這頁最後一筆的 { createdAt, id } 編起來')
    cursor = page.nextCursor
  }
  assert.fail('翻了 100 頁還沒結束：nextCursor 要在最後一頁變成 null')
}

const newestFirst = (a: Order, b: Order) => a.createdAt === b.createdAt ? b.id - a.id : (a.createdAt < b.createdAt ? 1 : -1)

test('逐頁讀完：每筆剛好出現一次，順序是 createdAt 新到舊、同時間 id 大到小', opts, async () => {
  for (const limit of [5, 7]) {
    const { url, store, clock } = await start()
    await seed(store, clock, 25, 3)
    const seen = await readAll(url, limit)
    const ids = seen.map(o => o.id)
    assert.equal(new Set(ids).size, ids.length, `limit=${limit}：有訂單重複出現。同一個 createdAt 有好幾筆時，cursor 要同時用 createdAt 和 id`)
    assert.equal(ids.length, 25, `limit=${limit}：要剛好讀到 25 筆，讀到 ${ids.length} 筆（同時間的訂單被跳過了？）`)
    assert.deepEqual(ids, store.all().sort(newestFirst).map(o => o.id), `limit=${limit}：順序要是 createdAt DESC, id DESC`)
  }
})

test('最後一頁的 nextCursor 是 null，剛好整除時也一樣；沒給 limit 預設 10 筆', opts, async () => {
  const { url, store, clock } = await start()
  await seed(store, clock, 20, 1)
  const first = await getPage(url, '')
  assert.equal(first.items.length, 10, '沒給 limit 時一頁 10 筆')
  assert.ok(first.nextCursor, '還有資料時要有 nextCursor')
  const second = await getPage(url, `?cursor=${encodeURIComponent(first.nextCursor)}`)
  assert.equal(second.items.length, 10)
  assert.equal(second.nextCursor, null, '20 筆、每頁 10 筆：第二頁就是最後一頁，nextCursor 要是 null，不能讓客戶端再多打一次拿到空頁（提示：多拿一筆，看還有沒有下一頁）')
})

test('翻頁途中有新訂單進來：之後的頁面不重複，也不漏掉原本的訂單', opts, async () => {
  const { url, store, clock } = await start()
  await seed(store, clock, 25, 2)
  const original = store.all().map(o => o.id)
  const seen = await readAll(url, 5, async () => {
    clock.t += 60_000
    for (let i = 0; i < 3; i++) await store.create({ drink: '美式咖啡', qty: 1 })
  })
  const ids = seen.map(o => o.id)
  assert.equal(new Set(ids).size, ids.length, '讀第一頁之後新增了 3 筆，後面的頁面出現重複：offset 分頁會這樣，改用 cursor（上一頁最後一筆的 createdAt 和 id）')
  for (const id of original) assert.ok(ids.includes(id), `原本的訂單 ${id} 被漏掉了`)
})

test('limit 不對回 400：0、51、abc、1.5', opts, async () => {
  const { url } = await start()
  for (const bad of ['0', '51', 'abc', '1.5', '-3']) {
    const res = await fetch(`${url}/orders?limit=${bad}`)
    assert.equal(res.status, 400, `limit=${bad} 要回 400（1 到 50 的整數才可以），收到 ${res.status}`)
  }
  assert.equal((await fetch(`${url}/orders?limit=50`)).status, 200, 'limit=50 可以')
})

test('cursor 壞掉回 400，不能變成 500', opts, async () => {
  const { url, store, clock } = await start()
  await seed(store, clock, 3, 1)
  for (const bad of ['abc', '!!!', Buffer.from('{"createdAt":1}').toString('base64url'), Buffer.from('7').toString('base64url')]) {
    const res = await fetch(`${url}/orders?cursor=${encodeURIComponent(bad)}`)
    assert.equal(res.status, 400, `cursor=${bad} 要回 400（客戶端送錯），收到 ${res.status}。decodeCursor 丟出的 InvalidCursorError 要接住`)
  }
})
