// 練習 2：searchMenu 把篩選、排序、分頁都交給 API
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { clientFor, recordingProxy, requireStack, sql } from '../../helpers/supa.ts'
import { PAGE_SIZE, searchMenu } from './menu.ts'

let proxy: Awaited<ReturnType<typeof recordingProxy>>
before(async () => {
  requireStack(['db', 'kong', 'rest'])
  proxy = await recordingProxy()
})
after(() => proxy?.close())

// 菜單是 public.products（公開可讀），這題只讀不寫
const expected = (maxPrice = 1e9, keyword = '', page = 1) => sql(`select name, price from public.products
  where price <= $1 and name ilike '%' || $2 || '%' order by price, id limit $3 offset $4`, [maxPrice, keyword, PAGE_SIZE, (page - 1) * PAGE_SIZE])

const cases: [string, Parameters<typeof searchMenu>[1]][] = [
  ['沒有條件的第 1 頁', {}],
  ['沒有條件的第 2 頁', { page: 2 }],
  ['110 元以下的第 2 頁（拿鐵和卡布奇諾都是 110，要依 id 排）', { maxPrice: 110, page: 2 }],
  ['100 元以下', { maxPrice: 100 }],
  ['名稱有「咖啡」', { keyword: '咖啡' }],
  ['名稱有「茶」而且 100 元以下', { keyword: '茶', maxPrice: 100 }],
  ['超過最後一頁', { page: 5 }],
]
for (const [name, q] of cases) test(`結果正確：${name}`, async () => {
  assert.deepEqual(await searchMenu(clientFor('public'), q), await expected(q.maxPrice, q.keyword, q.page),
    `${JSON.stringify(q)} 的結果不對：每項只有 name、price，依 price 再依 id 排序，每頁 ${PAGE_SIZE} 筆`)
})

test('篩選、排序、分頁都在 API 的 query 裡（只發一個請求）', async () => {
  proxy.requests.length = 0
  await searchMenu(clientFor('public', undefined, proxy.url), { maxPrice: 110, keyword: '拿', page: 2 })
  assert.equal(proxy.requests.length, 1, `要剛好 1 個請求，實際是 ${proxy.requests.length} 個`)
  const q = proxy.requests[0].query
  assert.equal(q.get('price'), 'lte.110', '價格上限用 .lte(\'price\', maxPrice) 交給 API：抓全部再用 JavaScript filter，資料一多就會把整張表傳給瀏覽器')
  assert.match(q.get('name') ?? '', /^ilike\.%拿%$/, '關鍵字用 .ilike(\'name\', `%${keyword}%`)')
  assert.match(q.get('order') ?? '', /^price(\.asc)?,id(\.asc)?$/, '排序要是 price 再 id（.order(\'price\').order(\'id\')）：只依 price 排時，同價格的商品在不同頁之間可能重複或消失')
  assert.equal(q.get('limit'), String(PAGE_SIZE), `一頁 ${PAGE_SIZE} 筆用 .range(from, to)（或 limit）交給 API`)
  assert.equal(q.get('offset'), String(PAGE_SIZE), '第 2 頁要從第 PAGE_SIZE 筆開始：.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)')
})

test('沒給條件時不送篩選參數', async () => {
  proxy.requests.length = 0
  await searchMenu(clientFor('public', undefined, proxy.url), {})
  const q = proxy.requests[0]?.query
  assert.ok(q && !q.has('price') && !q.has('name'), '沒給 maxPrice、keyword 時，不要送 price、name 的篩選（例如 ilike.%undefined%）')
})
