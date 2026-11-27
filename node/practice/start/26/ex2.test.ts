import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { assertProblem, call, opts, setupDb, startApp } from './testkit.ts'

const db = await setupDb()
const { url } = await startApp(db.url)

test('GET /menu：cursor 分頁，中途刪掉一筆也不重複、不漏', opts, async () => {
  // 清掉訂單，商品才刪得掉；再加 5 個隨機名稱的商品
  await db.pool.query('DELETE FROM order_items; DELETE FROM orders')
  for (let i = 0; i < 5; i++) await db.pool.query('INSERT INTO products (name, price) VALUES ($1, $2)', [`季節限定 ${randomBytes(3).toString('hex')}`, 100 + i])

  const first = await call(url + '/menu?limit=4')
  assert.equal(first.status, 200, `GET /menu?limit=4 要回 200，實際 ${first.status}：${first.text.slice(0, 200)}`)
  assert.ok(Array.isArray(first.json?.items), '回應要是 { items: [...], nextCursor }')
  assert.equal(first.json.items.length, 4, 'limit=4 時第一頁要有 4 筆')
  assert.deepEqual(Object.keys(first.json.items[0]).sort(), ['id', 'name', 'price'], '每個商品是 { id, name, price }')
  assert.equal(typeof first.json.nextCursor, 'string', '還有下一頁時 nextCursor 是字串')

  // 拿到第一頁之後，店長下架了第一頁上的一個商品
  const removed = first.json.items[2].id
  await db.pool.query('DELETE FROM products WHERE id = $1', [removed])

  const seen: number[] = first.json.items.map((p: { id: number }) => p.id)
  let cursor: string | null = first.json.nextCursor
  for (let page = 0; cursor && page < 10; page++) {
    const r = await call(`${url}/menu?limit=4&cursor=${encodeURIComponent(cursor)}`)
    assert.equal(r.status, 200, `帶 cursor 的下一頁要回 200，實際 ${r.status}`)
    seen.push(...r.json.items.map((p: { id: number }) => p.id))
    cursor = r.json.nextCursor
  }
  assert.equal(cursor, null, '最後一頁的 nextCursor 要是 null')
  const { rows } = await db.pool.query<{ id: number }>('SELECT id FROM products ORDER BY id')
  const expected = [removed, ...rows.map(r => r.id)].sort((a, b) => a - b)
  assert.deepEqual([...seen].sort((a, b) => a - b), expected, `翻完所有頁要剛好看到每個商品一次：用 offset 分頁時，前面少一筆，後面就會跳過一筆。要用 keyset（WHERE id > 上一頁最後一筆）`)
})

test('GET /menu：limit 與 cursor 不對回 400', opts, async () => {
  for (const q of ['limit=0', 'limit=51', 'limit=abc', 'cursor=%%%', `cursor=${Buffer.from('{"id":"x"}').toString('base64url')}`]) {
    assertProblem(await call(`${url}/menu?${q}`), 400, 'validation', `GET /menu?${q}`)
  }
})

test('ETag、304 與 Cache-Control；資料改了 ETag 就變', opts, async () => {
  const a = await call(url + '/menu')
  const etag = a.headers.get('etag')
  assert.ok(etag, 'GET /menu 要帶 ETag 標頭')
  assert.match(etag!, /^(W\/)?".+"$/, 'ETag 要用雙引號包起來，例如 "abc123"')
  assert.equal(a.headers.get('cache-control'), 'public, max-age=60', 'Cache-Control 要是 public, max-age=60')

  const b = await call(url + '/menu', { headers: { 'if-none-match': etag! } })
  assert.equal(b.status, 304, '帶著相同的 If-None-Match 要回 304')
  assert.equal(b.text, '', '304 不能有 body')
  assert.equal(b.headers.get('etag'), etag, '304 也要帶 ETag')

  const price = 100 + Math.floor(Math.random() * 900)
  await db.pool.query('UPDATE products SET price = $1 WHERE id = (SELECT min(id) FROM products)', [price])
  const c = await call(url + '/menu', { headers: { 'if-none-match': etag! } })
  assert.equal(c.status, 200, '價格改了之後，舊的 ETag 不能再回 304：ETag 要依回應內容計算')
  assert.notEqual(c.headers.get('etag'), etag, '內容改了 ETag 要不一樣')
  assert.equal(c.json.items[0].price, price, '要回新的價格')

  const item = await call(url + '/menu/2')
  assert.ok(item.headers.get('etag'), 'GET /menu/:id 也要帶 ETag')
  assert.equal((await call(url + '/menu/2', { headers: { 'if-none-match': item.headers.get('etag')! } })).status, 304, 'GET /menu/:id 也要支援 304')
})

test('GET /menu/:id：存在回商品，不存在回 404 problem+json', opts, async () => {
  const r = await call(url + '/menu/2')
  assert.equal(r.status, 200)
  assert.deepEqual(r.json, { id: 2, name: '拿鐵', price: 110 }, 'GET /menu/2 回 { id, name, price }')
  const id = 90_000 + Math.floor(Math.random() * 9999)
  const nf = await call(`${url}/menu/${id}`)
  assertProblem(nf, 404, 'not-found', `GET /menu/${id}`)
  assert.equal(nf.json.status, 404, 'problem 的 status 欄位要是 404')
})
