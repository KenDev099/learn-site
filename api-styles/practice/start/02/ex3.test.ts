import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { buildSchema, isSchema, lexicographicSortSchema, printSchema } from 'graphql'
import { gql, quietYogaLogs } from '../../helpers/graphql.ts'
import { listen } from '../../helpers/http.ts'
import { mulberry32, shuffle } from '../../helpers/coffee.ts'
import { menu, type Product } from './data.ts'
import * as server from './server.ts'

const opts = { timeout: 10_000 }
quietYogaLogs()

// 換掉 data.ts 裡的菜單：打亂順序、改價格、多一個茶飲。resolver 要讀 data.ts，寫死的資料不會過
const random = mulberry32(Date.now())
const extra: Product = { id: String(70 + Math.floor(random() * 20)), name: '抹茶拿鐵', price: 130, category: 'TEA', description: null }
menu.splice(0, menu.length, ...shuffle([...menu, extra], random).map(p => ({ ...p, price: p.price + Math.floor(random() * 20) })))
const expected = structuredClone(menu)   // 查詢前先記下來：resolver 改到 menu 陣列（例如 sort()）時才抓得到

const yoga = server.yoga
assert.ok(yoga && typeof yoga.fetch === 'function', 'server.ts 要 export const yoga = createYoga(…)')

test('schema 是用 menu.graphql 建立的', opts, () => {
  assert.ok(isSchema(server.schema), 'server.ts 要 export const schema = createSchema(…)')
  const sdl = readFileSync(new URL('./menu.graphql', import.meta.url), 'utf8')
  const print = (s: Parameters<typeof lexicographicSortSchema>[0]) => printSchema(lexicographicSortSchema(s))
  assert.equal(print(server.schema), print(buildSchema(sdl)), 'createSchema 的 typeDefs 要讀 menu.graphql（readFileSync(new URL(\'./menu.graphql\', import.meta.url), \'utf8\')），不要在 server.ts 裡另外寫一份 SDL：兩份會不同步')
})

test('menu 回傳 data.ts 的全部商品，依原本的順序', opts, async () => {
  const { status, body } = await gql(yoga, '{ menu { id name price category description } }')
  assert.equal(body.errors, undefined, `不應該有錯誤：${body.errors?.[0]?.message}`)
  assert.equal(status, 200)
  assert.deepEqual(body.data.menu, expected, 'menu 要依原本的順序回傳 data.ts 的 menu 陣列（測試換過內容，寫死的資料不會過）')
  assert.deepEqual(menu, expected, 'resolver 不能改動 data.ts 的 menu 陣列：sort()、reverse()、splice() 會直接改原陣列，下一個請求就拿到被改過的資料')
})

test('menu(category) 依分類過濾', opts, async () => {
  for (const category of ['TEA', 'COFFEE', 'FOOD']) {
    const { body } = await gql(yoga, 'query ($c: Category) { menu(category: $c) { id } }', { c: category })
    assert.equal(body.errors, undefined, `menu(category: ${category}) 不應該有錯誤：${body.errors?.[0]?.message}`)
    assert.deepEqual(body.data.menu.map((p: Product) => p.id), menu.filter(p => p.category === category).map(p => p.id), `menu(category: ${category}) 只回該分類的商品`)
  }
  const { body } = await gql(yoga, 'query ($c: Category) { menu(category: $c) { id } }', { c: null })
  assert.equal(body.data?.menu?.length, menu.length, 'category 傳 null 等於沒給，回全部商品')
})

test('product(id) 找得到回商品，找不到回 null 而且沒有 errors', opts, async () => {
  for (const p of shuffle(menu, random).slice(0, 3)) {
    const { body } = await gql(yoga, 'query ($id: ID!) { product(id: $id) { id name price } }', { id: p.id })
    assert.equal(body.errors, undefined, `product(id: "${p.id}") 不應該有錯誤：${body.errors?.[0]?.message}`)
    assert.deepEqual(body.data.product, { id: p.id, name: p.name, price: p.price }, `product(id: "${p.id}") 要回${p.name}（用 id 比對，不是用陣列位置）`)
  }
  const { body } = await gql(yoga, '{ product(id: "999") { name } }')
  assert.equal(body.errors, undefined, '找不到商品是正常情況，不要丟錯：回 null')
  assert.deepEqual(body.data, { product: null }, 'product(id: "999") 要回 null')
})

test('拼錯欄位：驗證失敗、400、沒有 data', opts, async () => {
  const { status, body } = await gql(yoga, '{ menu { nmae } }')
  assert.equal(status, 400, '驗證失敗時（Accept: application/graphql-response+json）Yoga 回 400')
  assert.ok(body.errors?.length, '要有 errors')
  assert.ok(!('data' in body), '驗證失敗時整份查詢都不執行，回應裡沒有 data')
})

test('yoga 可以直接當 node:http 的請求處理函式', opts, async () => {
  const { url } = await listen(createServer(yoga))
  const res = await fetch(`${url}/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ menu { name } }' }),
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { data: { menu: menu.map(p => ({ name: p.name })) } })
})
