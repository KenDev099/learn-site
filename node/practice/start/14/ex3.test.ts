import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'
import { OrderStore, STATUSES, type Status } from './orders.ts'

const opts = { timeout: 15_000 }

// 合法的轉換寫在這裡（測試自己的一份，不讀 orders.ts）
const ALLOWED = new Set(['pending>brewing', 'pending>cancelled', 'brewing>ready', 'ready>picked_up'])

async function start() {
  const mod: { createApp?: unknown } = await import('./update-status.ts')
  assert.equal(typeof mod.createApp, 'function', 'update-status.ts 要 export createApp(store)')
  const store = new OrderStore()
  const { url } = await listen((mod.createApp as (s: OrderStore) => Server)(store))
  return { url, store }
}

const patch = (url: string, id: number, body: unknown) =>
  fetch(`${url}/orders/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('每一種「從 → 到」的組合：合法的回 200 並改好，不合法的回 409 problem+json', opts, async () => {
  const { url, store } = await start()
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const order = await store.create({ drink: '拿鐵', qty: 1 })
      store.setStatus(order.id, from)
      const res = await patch(url, order.id, { status: to })
      if (ALLOWED.has(`${from}>${to}`)) {
        assert.equal(res.status, 200, `${from} → ${to} 是合法的轉換，要回 200，收到 ${res.status}`)
        const body = await res.json() as { id: number, status: Status }
        assert.equal(body.status, to, '回應要是改好之後的訂單')
        assert.equal(store.get(order.id)?.status, to, '要真的改到 store 裡')
      } else {
        assert.equal(res.status, 409, `${from} → ${to} 不合法，要回 409 Conflict（請求格式沒錯，是和訂單目前的狀態衝突），收到 ${res.status}`)
        assert.match(res.headers.get('content-type') ?? '', /^application\/problem\+json\b/, '409 也要是 problem+json')
        const body = await res.json() as { detail?: string, status?: number }
        assert.equal(body.status, 409)
        assert.ok(body.detail?.includes(from) && body.detail.includes(to), `detail 要寫出目前的狀態（${from}）和要求的狀態（${to}），收到：${body.detail}`)
        assert.equal(store.get(order.id)?.status, from, `不合法的轉換不能改到訂單（${from} → ${to}）`)
      }
    }
  }
})

test('訂單不存在回 404', opts, async () => {
  const { url } = await start()
  const id = 100 + Math.floor(Math.random() * 900)
  const res = await patch(url, id, { status: 'brewing' })
  assert.equal(res.status, 404, `PATCH /orders/${id}（不存在）要回 404，收到 ${res.status}`)
  assert.match(res.headers.get('content-type') ?? '', /^application\/problem\+json\b/)
})

test('body 不對回 400：不認得的狀態、少了 status、不是物件', opts, async () => {
  const { url, store } = await start()
  const order = await store.create({ drink: '拿鐵', qty: 1 })
  for (const bad of [{ status: 'done' }, { status: 'PENDING' }, {}, { state: 'brewing' }, ['brewing'], 'brewing', null]) {
    const res = await patch(url, order.id, bad)
    assert.equal(res.status, 400, `body ${JSON.stringify(bad)} 要回 400（格式不對，和訂單狀態無關），收到 ${res.status}`)
  }
  assert.equal(store.get(order.id)?.status, 'pending', 'body 不對時不能改到訂單')
})
