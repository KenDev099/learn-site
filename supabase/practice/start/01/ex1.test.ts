// 練習 1：本機 Supabase 跑起來了，stack.json 填的是 supabase status 印出來的 Project URL 與 publishable key
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requireStack, stack } from '../../helpers/supa.ts'

const dir = import.meta.dirname
let mine: { apiUrl: string, publishableKey: string }

before(() => {
  requireStack(['db', 'kong', 'rest', 'auth'])
  const text = readFileSync(join(dir, 'stack.json'), 'utf8')
  try { mine = JSON.parse(text) } catch (e) { throw new Error(`stack.json 不是合法的 JSON：${(e as Error).message}`) }
})

test('這課需要的服務都在跑（db、kong、rest、auth）', () => {
  // before() 已經檢查過；這一項讓「服務沒開」單獨顯示成一個沒過的項目
  assert.ok(stack().API_URL)
})

test('publishableKey 是 Publishable key，不是 Secret key', () => {
  assert.ok(mine.publishableKey, 'stack.json 的 publishableKey 還是空的：把 supabase status 的 Authentication Keys → Publishable 那一串貼進來')
  assert.ok(!mine.publishableKey.startsWith('sb_secret_'), '你貼的是 Secret key（sb_secret_ 開頭）：它會繞過所有權限檢查，只能放在伺服器。前端用的是 Publishable（sb_publishable_ 開頭）')
  assert.equal(mine.publishableKey, stack().PUBLISHABLE_KEY, '跟 supabase status 印出的 Publishable key 不一樣：整串複製，前後不要多空白')
})

test('apiUrl 是 API gateway 的網址（Project URL，port 55421）', () => {
  assert.ok(mine.apiUrl, 'stack.json 的 apiUrl 還是空的：把 supabase status 的 APIs → Project URL 貼進來')
  const url = new URL(mine.apiUrl)
  assert.ok(url.protocol === 'http:', 'apiUrl 要是 http:// 開頭的 Project URL；postgresql:// 是資料庫的直連網址，前端程式不會用它')
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'apiUrl 的主機要是 localhost（或 127.0.0.1）')
  assert.equal(url.port, new URL(stack().API_URL).port, `port 要是 ${new URL(stack().API_URL).port}：這門課改掉了 Supabase 預設的 54321，避免跟你其他的 Supabase 專案衝突`)
  assert.ok(url.pathname === '/' && !url.search, 'apiUrl 只到 port 為止，不要加 /rest/v1 這類路徑：supabase-js 會自己接上各服務的路徑')
})

test('用這兩個值真的讀得到菜單', async () => {
  const r = await fetch(new URL('/rest/v1/products?select=name', mine.apiUrl), { headers: { apikey: mine.publishableKey } })
  const body = await r.text()
  assert.equal(r.status, 200, `GET /rest/v1/products 回 ${r.status}：${body}`)
  assert.equal(JSON.parse(body).length, 6, '菜單應該有 6 項商品')
})
