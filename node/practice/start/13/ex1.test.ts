import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Item = { id: number, name: string, price: number }

// 每次用不同的菜單：寫死 MENU 的內容不會過
const id = () => 10 + Math.floor(Math.random() * 900)
const menu: Item[] = [
  { id: id(), name: '拿鐵', price: 100 + Math.floor(Math.random() * 50) },
  { id: id() + 1000, name: '可頌', price: 60 + Math.floor(Math.random() * 30) },
]

async function start() {
  const mod: { createApp?: unknown } = await import('./app.ts')
  assert.equal(typeof mod.createApp, 'function', 'app.ts 要 export function createApp(menu)')
  const server = (mod.createApp as (m: Item[]) => Server)(menu)
  return (await listen(server)).url
}

async function call(base: string, path: string, method = 'GET') {
  const res = await fetch(base + path, { method, signal: AbortSignal.timeout(3000) })
  const text = await res.text()
  let json: unknown
  try { json = JSON.parse(text) } catch { assert.fail(`${method} ${path} 的回應不是 JSON：${text.slice(0, 100)}`) }
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8', `${method} ${path} 的 Content-Type 要是 application/json; charset=utf-8（用 sendJson／sendError）`)
  return { status: res.status, allow: res.headers.get('allow'), json: json as any }
}

test('GET /menu 回 200 和整份菜單，加了查詢字串也一樣', opts, async () => {
  const base = await start()
  const a = await call(base, '/menu')
  assert.equal(a.status, 200, 'GET /menu 要回 200')
  assert.deepEqual(a.json, menu, 'GET /menu 要回傳 createApp 收到的菜單陣列')
  const b = await call(base, '/menu?x=1')
  assert.equal(b.status, 200, 'GET /menu?x=1 也要回 200：路由要比對 pathname，不是整個 req.url')
  assert.deepEqual(b.json, menu)
})

test('GET /menu/:id 回該品項，找不到回 404', opts, async () => {
  const base = await start()
  for (const item of menu) {
    const r = await call(base, `/menu/${item.id}`)
    assert.equal(r.status, 200, `GET /menu/${item.id} 要回 200`)
    assert.deepEqual(r.json, item, `GET /menu/${item.id} 要回傳那一個品項`)
  }
  const missing = await call(base, '/menu/5')
  assert.equal(missing.status, 404, '菜單裡沒有的 id 要回 404')
  assert.equal(missing.json?.error?.code, 'NOT_FOUND', '404 的格式是 { error: { code: "NOT_FOUND", message } }')
  assert.equal(typeof missing.json?.error?.message, 'string', 'error 裡要有 message')
})

test('不存在的路徑回 404', opts, async () => {
  const base = await start()
  for (const path of ['/menu/abc', '/menu/', '/menus', '/', `/menu/${menu[0].id}/x`]) {
    const r = await call(base, path)
    assert.equal(r.status, 404, `GET ${path} 要回 404`)
    assert.equal(r.json?.error?.code, 'NOT_FOUND', `GET ${path} 的錯誤 code 要是 NOT_FOUND`)
  }
})

test('路徑存在但方法不對：405 加 Allow: GET', opts, async () => {
  const base = await start()
  for (const [method, path] of [['POST', '/menu'], ['DELETE', `/menu/${menu[1].id}`], ['PUT', '/menu?x=1']]) {
    const r = await call(base, path, method)
    assert.equal(r.status, 405, `${method} ${path}：路徑存在、方法不支援，要回 405，不是 404`)
    assert.equal(r.allow, 'GET', `${method} ${path} 的 405 要帶 Allow: GET 標頭，告訴客戶端可以用哪些方法`)
    assert.equal(r.json?.error?.code, 'METHOD_NOT_ALLOWED', '405 的錯誤 code 要是 METHOD_NOT_ALLOWED')
  }
  for (const path of ['/nothing', '/menu/abc']) {
    const r = await call(base, path, 'DELETE')
    assert.equal(r.status, 404, `DELETE ${path}：這個路徑不存在（id 只能是數字），還是 404，不是 405`)
  }
})
