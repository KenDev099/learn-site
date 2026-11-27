// 練習 3：HTTP API payload 2.0 的訂單 handler：身分從 JWT claims 來、body 是字串、可能是 base64
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createOrdersHandler, type HttpEvent, type Order, type Store } from './orders-handler.ts'

function memoryStore(): Store & { rows: Order[] } {
  const rows: Order[] = [
    { id: 'o-1', customerId: 'cust-wang', items: [{ productId: 2, quantity: 1 }] },
    { id: 'o-2', customerId: 'cust-chen', items: [{ productId: 1, quantity: 2 }] },
  ]
  return {
    rows,
    get: async id => rows.find(r => r.id === id),
    create: async o => { const row = { id: `o-${rows.length + 1}`, ...o }; rows.push(row); return row },
  }
}
// 照 API Gateway 送來的樣子組事件：body 一定是字串（或沒有）
function ev(routeKey: string, opts: { sub?: string, id?: string, body?: string, base64?: boolean, query?: Record<string, string> } = {}): HttpEvent {
  return {
    routeKey,
    pathParameters: opts.id ? { id: opts.id } : undefined,
    queryStringParameters: opts.query,
    headers: { 'content-type': 'application/json' },
    body: opts.body,
    isBase64Encoded: !!opts.base64,
    requestContext: opts.sub ? { authorizer: { jwt: { claims: { sub: opts.sub, iss: 'https://auth.cafe.example.com/' } } } } : {},
  }
}
const parse = (r: { body?: string }) => { assert.equal(typeof r.body, 'string', '回應的 body 要是 JSON 字串（JSON.stringify）'); return JSON.parse(r.body!) }

test('GET 自己的訂單：200，body 是 JSON 字串、有 content-type', async () => {
  const h = createOrdersHandler(memoryStore())
  const r = await h(ev('GET /orders/{id}', { sub: 'cust-wang', id: 'o-1' }))
  assert.equal(r.statusCode, 200, '自己的訂單回 200')
  assert.equal(r.headers?.['content-type'], 'application/json', '要加 content-type: application/json')
  assert.deepEqual(parse(r), { id: 'o-1', customerId: 'cust-wang', items: [{ productId: 2, quantity: 1 }] })
})

test('別人的訂單和不存在的訂單：都是 404；沒有 claims 是 401', async () => {
  const h = createOrdersHandler(memoryStore())
  assert.equal((await h(ev('GET /orders/{id}', { sub: 'cust-wang', id: 'o-2' }))).statusCode, 404,
    'o-2 是陳美華的：回 404，跟不存在一樣，不讓人試出哪些 id 存在（Auth 課的 BOLA）')
  assert.equal((await h(ev('GET /orders/{id}', { sub: 'cust-wang', id: 'o-999' }))).statusCode, 404, '不存在回 404')
  assert.equal((await h(ev('GET /orders/{id}', { sub: 'cust-wang', id: 'o-2', query: { userId: 'cust-chen' } }))).statusCode, 404,
    '身分只能從 requestContext.authorizer.jwt.claims.sub 拿：query string 是客人自己填的，可以亂寫')
  assert.equal((await h(ev('GET /orders/{id}', { id: 'o-1' }))).statusCode, 401, '沒有 JWT claims（route 沒掛 authorizer）時回 401')
})

test('POST：body 是字串要 JSON.parse；customerId 一律用 sub', async () => {
  const store = memoryStore()
  const h = createOrdersHandler(store)
  const r = await h(ev('POST /orders', { sub: 'cust-lin', body: JSON.stringify({ customerId: 'cust-wang', items: [{ productId: 3, quantity: 2 }] }) }))
  assert.equal(r.statusCode, 201, '建立成功回 201')
  const order = parse(r)
  assert.equal(order.customerId, 'cust-lin', 'customerId 要用 claims.sub，不能用 body 裡客人自己填的 customerId')
  assert.deepEqual(order.items, [{ productId: 3, quantity: 2 }])
  assert.equal(store.rows.length, 3, '要用 store.create 存起來')
})

test('POST：isBase64Encoded 時先解 base64', async () => {
  const h = createOrdersHandler(memoryStore())
  const body = Buffer.from(JSON.stringify({ items: [{ productId: 5, quantity: 1 }] })).toString('base64')
  const r = await h(ev('POST /orders', { sub: 'cust-zhang', body, base64: true }))
  assert.equal(r.statusCode, 201, 'isBase64Encoded 是 true 時，body 是 base64：Buffer.from(body, \'base64\').toString(\'utf8\') 之後再 JSON.parse')
  assert.deepEqual(parse(r).items, [{ productId: 5, quantity: 1 }])
})

test('POST：壞掉的 JSON、不合法的 items 回 400，不能丟例外變成 500', async () => {
  const h = createOrdersHandler(memoryStore())
  const bad = ['{', JSON.stringify({}), JSON.stringify({ items: [] }), JSON.stringify({ items: [{ productId: 1, quantity: 0 }] }),
    JSON.stringify({ items: [{ productId: '1', quantity: 1 }] }), JSON.stringify({ items: [{ productId: 1, quantity: 21 }] })]
  for (const body of bad) {
    const r = await h(ev('POST /orders', { sub: 'cust-li', body }))
    assert.equal(r.statusCode, 400, `body ${body} 要回 400`)
  }
  assert.equal((await h(ev('DELETE /orders/{id}', { sub: 'cust-li', id: 'o-1' }))).statusCode, 404, '沒處理的 routeKey 回 404')
})
