// 練習 3：fetchMenu 用一個 HTTP 請求向 Data API 要排好序、只有兩欄的菜單，並帶上傳進來的 key
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { recordingProxy, requireStack, sql, stack } from '../../helpers/supa.ts'
import { fetchMenu } from './menu.ts'

let proxy: Awaited<ReturnType<typeof recordingProxy>>
before(async () => {
  requireStack(['db', 'kong', 'rest'])
  proxy = await recordingProxy()
})
after(() => proxy?.close())

test('回傳依價格、再依名稱排序的菜單，每項只有 name 與 price', async () => {
  const want = await sql('select name, price from public.products order by price, name')
  assert.deepEqual(await fetchMenu(proxy.url, stack().PUBLISHABLE_KEY), want,
    '結果要跟資料庫一樣：6 項商品，先依 price、再依 name 由小到大，每項只有 name、price 兩個欄位（select=name,price）')
})

test('只發一個請求：GET /rest/v1/products，用傳進來的 apiUrl 與 key', async () => {
  proxy.requests.length = 0
  await fetchMenu(proxy.url, stack().PUBLISHABLE_KEY)
  assert.equal(proxy.requests.length, 1, `要剛好向傳進來的 apiUrl 發 1 個請求，實際是 ${proxy.requests.length} 個（0 個代表網址寫死了，或根本沒有呼叫 API）`)
  const [req] = proxy.requests
  assert.equal(`${req.method} ${req.path}`, 'GET /rest/v1/products', '路徑是 /rest/v1/ 接表名')
  assert.equal(req.headers.apikey, stack().PUBLISHABLE_KEY, 'apikey header 要是傳進來的 key（前端只用 publishable key；不要寫死、也不要用 secret key）')
})

test('排序與欄位交給 API：query 有 select 與 order', async () => {
  proxy.requests.length = 0
  await fetchMenu(proxy.url, stack().PUBLISHABLE_KEY)
  const q = proxy.requests[0]?.query
  assert.ok(q, '沒有收到請求')
  assert.deepEqual((q.get('select') ?? '').split(',').map(s => s.trim()).sort(), ['name', 'price'], 'select 參數要只列 name 和 price：沒寫 select 等於 select=*，會連不需要的欄位一起傳回來')
  assert.match(q.get('order') ?? '', /^price(\.asc)?,name(\.asc)?$/, 'order 參數要先 price、再 name（例如 order=price.asc,name.asc）：排序交給資料庫，不要抓回來再用 JavaScript 排')
})

test('API 回錯誤時丟出 Error，不回傳空陣列', async () => {
  const broken = createServer((_, res) => res.writeHead(503, { 'content-type': 'application/json' }).end('{"message":"維護中"}'))
  await new Promise<void>(res => broken.listen(0, '127.0.0.1', res))
  try {
    const url = `http://localhost:${(broken.address() as AddressInfo).port}`
    await assert.rejects(fetchMenu(url, stack().PUBLISHABLE_KEY), 'fetch 不會因為 4xx／5xx 丟錯：要自己檢查 res.ok，不是 2xx 就 throw')
  } finally {
    broken.close()
  }
})
