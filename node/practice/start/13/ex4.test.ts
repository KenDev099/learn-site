import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const STATUSES = ['pending', 'brewing', 'ready', 'picked_up']
const DRINKS = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶', '可頌', '起司蛋糕']
type Order = { id: number, drink: string, status: string }
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

// 隨機的訂單：寫死結果不會過
const orders: Order[] = Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, drink: pick(DRINKS), status: pick(STATUSES) }))
// 確保每種狀態、每種飲料都至少有一筆
DRINKS.forEach((d, i) => { orders[i].drink = d })
STATUSES.forEach((s, i) => { orders[10 + i].status = s })

async function start() {
  const mod: { createApp?: unknown } = await import('./list-orders.ts')
  assert.equal(typeof mod.createApp, 'function', 'list-orders.ts 要 export function createApp(orders)')
  const server = (mod.createApp as (o: Order[]) => Server)(orders)
  return (await listen(server)).url
}

async function get(base: string, query: string) {
  const res = await fetch(`${base}/orders${query}`, { signal: AbortSignal.timeout(3000) })
  const json: any = await res.json()
  return { status: res.status, json }
}
const ids = (list: Order[]) => list.map(o => o.id)
const params = (pairs: [string, string][]) => '?' + new URLSearchParams(pairs).toString()

test('沒有參數回全部；只給 status 就篩 status', opts, async () => {
  const base = await start()
  const all = await get(base, '')
  assert.equal(all.status, 200)
  assert.deepEqual(ids(all.json.orders), ids(orders), '沒有參數時回傳全部訂單，順序不變')
  const status = pick(STATUSES)
  const r = await get(base, `?status=${status}`)
  assert.equal(r.status, 200, `?status=${status} 要回 200`)
  assert.deepEqual(ids(r.json.orders), ids(orders.filter(o => o.status === status)), `?status=${status} 只回那個狀態的訂單`)
})

test('drink 是 URL 編碼的中文，可以出現多次（多選）', opts, async () => {
  const base = await start()
  const [a, b] = [DRINKS[1], pick(DRINKS.filter(d => d !== DRINKS[1]))]
  const one = await get(base, params([['drink', a]]))   // 拿鐵 → %E6%8B%BF%E9%90%B5
  assert.equal(one.status, 200, `drink=${a}（URL 編碼）要回 200，收到 ${one.status}：查詢參數要先做 URL 解碼，用 url.searchParams`)
  assert.deepEqual(ids(one.json.orders), ids(orders.filter(o => o.drink === a)), `drink=${a} 只回那種飲料`)
  const two = await get(base, params([['drink', a], ['drink', b]]))
  assert.deepEqual(ids(two.json.orders), ids(orders.filter(o => o.drink === a || o.drink === b)), `drink=${a}&drink=${b} 要回兩種飲料的訂單：同名參數用 getAll 全部拿`)
  const status = pick(STATUSES)
  const both = await get(base, params([['status', status], ['drink', a], ['drink', b]]))
  assert.deepEqual(ids(both.json.orders), ids(orders.filter(o => o.status === status && (o.drink === a || o.drink === b))), 'status 和 drink 同時給時，兩個條件都要符合')
})

test('未知的參數忽略', opts, async () => {
  const base = await start()
  const r = await get(base, `?sort=price&page=2&x=${Math.random()}`)
  assert.equal(r.status, 200, '不認得的參數直接忽略，不是 400')
  assert.deepEqual(ids(r.json.orders), ids(orders))
})

test('不合法的 status 或 drink 回 400，列出所有原因', opts, async () => {
  const base = await start()
  for (const bad of ['done', 'READY', 'cancel']) {
    const s = await get(base, `?status=${bad}`)
    assert.equal(s.status, 400, `?status=${bad} 不是合法的狀態（大小寫也要完全一樣），要回 400，不能當成沒有篩選`)
    assert.equal(s.json?.error?.code, 'VALIDATION', '錯誤 code 要是 VALIDATION')
    assert.deepEqual(s.json.error.details?.map((d: any) => d.field), ['status'], 'details 要列出 status 欄位')
  }
  const bad = 'done'
  const d = await get(base, params([['drink', DRINKS[0]], ['drink', '珍珠奶茶']]))
  assert.equal(d.status, 400, 'drink 裡有菜單上沒有的品名（珍珠奶茶），要回 400')
  assert.deepEqual(d.json?.error?.details?.map((x: any) => x.field), ['drink'], 'details 要列出 drink 欄位')
  const both = await get(base, params([['status', bad], ['drink', DRINKS[0]], ['drink', '珍珠奶茶']]))
  assert.equal(both.status, 400)
  assert.deepEqual(both.json.error.details?.map((d: any) => d.field).sort(), ['drink', 'status'], 'status 和 drink 都不合法時，details 兩個都要列出來')
})
