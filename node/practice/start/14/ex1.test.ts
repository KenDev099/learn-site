import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'
import { OrderStore, DRINKS } from './orders.ts'

const opts = { timeout: 15_000 }

async function start() {
  const mod: { createApp?: unknown } = await import('./create-order.ts')
  assert.equal(typeof mod.createApp, 'function', 'create-order.ts 要 export createApp(store)')
  const store = new OrderStore()
  const { url } = await listen((mod.createApp as (s: OrderStore) => Server)(store))
  return { url, store }
}

const post = (url: string, body: unknown, type = 'application/json') =>
  fetch(url + '/orders', { method: 'POST', headers: { 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) })

// 每個錯誤回應都要是同一種格式：problem+json，type、title、status、detail 都有
async function expectProblem(res: Response, status: number, where: string, kind: string) {
  const { PROBLEM_BASE, PROBLEMS }: { PROBLEM_BASE?: string, PROBLEMS?: Record<string, { title: string }> } = await import('./problem.ts')
  assert.ok(PROBLEM_BASE && PROBLEMS, 'problem.ts 要保留 PROBLEM_BASE 和 PROBLEMS')
  assert.equal(res.status, status, `${where} 要回 ${status}`)
  const type = res.headers.get('content-type') ?? ''
  assert.match(type, /^application\/problem\+json\b/, `${where} 的 Content-Type 要是 application/problem+json，收到 ${type}`)
  const body = await res.json() as Record<string, unknown>
  assert.equal(body.type, PROBLEM_BASE + kind, `${where} 的 type 要是 PROBLEM_BASE 加上種類名稱（${PROBLEM_BASE + kind}），收到 ${body.type}`)
  assert.equal(body.title, PROBLEMS[kind]?.title, `${where} 的 title 要用 PROBLEMS 表裡 ${kind} 的 title`)
  assert.equal(body.status, status, `${where} 的 body.status 要和 HTTP 狀態碼一樣是 ${status}`)
  assert.equal(typeof body.detail, 'string', `${where} 的 body 要有 detail`)
  assert.equal('error' in body, false, `${where} 不要再用第 13 課的 { error: … } 包起來，problem details 的欄位放在最外層`)
  return body
}

test('POST /orders 成功：201、Location 指向新訂單，body 是訂單本身', opts, async () => {
  const { url, store } = await start()
  const drink = DRINKS[Math.floor(Math.random() * DRINKS.length)]
  const qty = 1 + Math.floor(Math.random() * 20)
  const res = await post(url, { drink, qty })
  assert.equal(res.status, 201, '建立成功要回 201 Created，不是 200')
  const location = res.headers.get('location')
  assert.ok(location, '201 要帶 Location 標頭，指出新訂單的網址')
  const order = await res.json() as Record<string, unknown>
  assert.equal(order.drink, drink, 'body 要是訂單本身（{ id, drink, qty, status, createdAt }），不要再包一層')
  assert.equal(order.qty, qty)
  assert.equal(typeof order.id, 'number')
  assert.equal(location, `/orders/${order.id}`, 'Location 要是 /orders/{id}')
  assert.equal(store.all().length, 1, '要真的存進 store')

  const again = await fetch(new URL(location, url))
  assert.equal(again.status, 200, `GET ${location} 要回 200`)
  assert.deepEqual(await again.json(), order, '用 Location 讀回來的要是同一筆訂單')
})

test('GET /orders/:id：每一筆都讀得到，找不到回 404 problem+json', opts, async () => {
  const { url } = await start()
  const created = []
  for (let i = 0; i < 3; i++) created.push(await (await post(url, { drink: '拿鐵', qty: i + 1 })).json() as { id: number })
  for (const o of created) {
    const res = await fetch(`${url}/orders/${o.id}`)
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), o)
  }
  const missing = 100 + Math.floor(Math.random() * 900)
  const body = await expectProblem(await fetch(`${url}/orders/${missing}`), 404, `GET /orders/${missing}`, 'not-found')
  assert.match(String(body.detail), new RegExp(String(missing)), 'detail 要說是哪一筆找不到')
})

test('驗證失敗：400 problem+json，errors 列出每個欄位', opts, async () => {
  const { url, store } = await start()
  const body = await expectProblem(await post(url, { drink: '珍珠奶茶', qty: 0 }), 400, '欄位不對的 POST /orders', 'validation')
  assert.ok(Array.isArray(body.errors), 'body 要有 errors 陣列（自訂的擴充欄位）')
  const fields = (body.errors as { field: string, message: string }[]).map(e => e.field).sort()
  assert.deepEqual(fields, ['drink', 'qty'], 'errors 要列出 drink 和 qty 兩個欄位，每個是 { field, message }')
  for (const e of body.errors as { message: unknown }[]) assert.equal(typeof e.message, 'string', 'errors 的每一項要有 message')
  assert.equal(store.all().length, 0, '驗證失敗不能建立訂單')
})

test('整個 API 的錯誤格式一致：JSON 壞掉、Content-Type 不對、路徑不存在、方法不對', opts, async () => {
  const { url } = await start()
  await expectProblem(await post(url, '{"drink":'), 400, 'JSON 壞掉', 'validation')
  await expectProblem(await post(url, 'drink=拿鐵', 'application/x-www-form-urlencoded'), 415, 'Content-Type 不是 JSON', 'unsupported-media-type')
  await expectProblem(await fetch(url + '/coupons'), 404, '不存在的路徑', 'not-found')
  const res = await fetch(url + '/orders', { method: 'DELETE' })
  await expectProblem(res, 405, 'DELETE /orders', 'method-not-allowed')
  assert.equal(res.headers.get('allow'), 'POST', '405 要帶 Allow')
  const created = await (await post(url, { drink: '拿鐵', qty: 1 })).json() as { id: number }
  const del = await fetch(`${url}/orders/${created.id}`, { method: 'DELETE' })
  await expectProblem(del, 405, `DELETE /orders/${created.id}`, 'method-not-allowed')
  assert.equal(del.headers.get('allow'), 'GET', '/orders/:id 只支援 GET，405 要帶 Allow: GET')
})
