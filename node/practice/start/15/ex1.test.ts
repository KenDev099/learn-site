import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Item = { id: number, name: string, nameEn: string, price: number }
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

// 每次用不同的菜單：寫死內容或 ETag 不會過
const suffix = pick(['特調', '大杯', '燕麥', '冰'])
const makeMenu = (): Item[] => ['美式咖啡', '拿鐵', '可頌'].map((n, i) => ({
  id: i + 1, name: n + suffix, nameEn: 'Item ' + i, price: 100 + Math.floor(Math.random() * 18),
}))

async function start(menu: Item[]) {
  const mod: { createApp?: unknown } = await import('./menu-cache.ts')
  assert.equal(typeof mod.createApp, 'function', 'menu-cache.ts 要 export function createApp(menu)')
  const server = (mod.createApp as (m: Item[]) => Server)(menu)
  return (await listen(server)).url
}

async function get(base: string, ifNoneMatch?: string) {
  const headers: Record<string, string> = ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch }
  const res = await fetch(base + '/menu', { headers, signal: AbortSignal.timeout(3000) })
  const text = await res.text()
  return { status: res.status, text, etag: res.headers.get('etag'), cacheControl: res.headers.get('cache-control') }
}

const STRONG = /^"[\x21\x23-\x7e]+"$/   // 雙引號包住、裡面沒有空白和雙引號

test('GET /menu 回 200、菜單、依內容算出的強 ETag 和 Cache-Control', opts, async () => {
  const menu = makeMenu()
  const a = await get(await start(menu))
  assert.equal(a.status, 200, 'GET /menu 要回 200')
  assert.deepEqual(JSON.parse(a.text), menu, 'body 要是整份菜單')
  assert.ok(a.etag, '回應要帶 ETag 標頭')
  assert.match(a.etag, STRONG, `ETag 要用雙引號包起來，例如 "abc123"（收到 ${a.etag}）`)
  assert.equal(a.cacheControl, 'public, max-age=60', 'Cache-Control 要是 public, max-age=60：菜單大家都一樣，可以快取 60 秒')
  await new Promise(r => setTimeout(r, 20))
  const b = await get(await start(structuredClone(menu)))
  assert.equal(b.etag, a.etag, '同樣的菜單內容（另一台伺服器、晚一點）要算出同一個 ETag：ETag 要從內容算，不能用時間或亂數')
  const c = await get(await start(menu))
  assert.equal(c.etag, a.etag)
})

test('If-None-Match 等於目前的 ETag：回 304，沒有 body，照樣帶 ETag 和 Cache-Control', opts, async () => {
  const base = await start(makeMenu())
  const { etag } = await get(base)
  assert.ok(etag, '回應要帶 ETag 標頭')
  const r = await get(base, etag)
  assert.equal(r.status, 304, '客戶端手上的版本就是最新的，要回 304')
  assert.equal(r.text, '', '304 不能有 body')
  assert.equal(r.etag, etag, '304 也要帶 ETag（200 會帶的 ETag、Cache-Control，304 都要帶）')
  assert.equal(r.cacheControl, 'public, max-age=60', '304 也要帶 Cache-Control，快取才知道接下來又能用多久')
})

test('菜單內容改了：舊 ETag 拿到 200 和新的 ETag', opts, async () => {
  const menu = makeMenu()
  const base = await start(menu)
  const before = await get(base)
  const item = pick(menu)
  item.price += 1          // 漲價 1 元：長度不變，內容變了
  const after = await get(base, before.etag ?? undefined)
  assert.equal(after.status, 200, '菜單改過之後，帶舊 ETag 要拿到 200 和新菜單；每次請求都要用目前的菜單算 ETag，不能在 createApp 時只算一次')
  assert.deepEqual(JSON.parse(after.text), menu, '要回新的菜單')
  assert.notEqual(after.etag, before.etag, '內容變了，ETag 要跟著變')
  const again = await get(base, after.etag ?? undefined)
  assert.equal(again.status, 304, '帶新的 ETag 要回 304')
})

test('If-None-Match 的各種寫法：清單、*、W/', opts, async () => {
  const base = await start(makeMenu())
  const { etag } = await get(base)
  assert.ok(etag && STRONG.test(etag), 'ETag 要用雙引號包起來')
  const hit: [string, string][] = [
    [`"old1", ${etag}`, '多個 ETag 用逗號分開，其中一個相符就是命中'],
    [`${etag},"old2"`, '逗號後面不一定有空白'],
    ['*', '* 代表「任何版本」，資源存在就命中'],
    [`W/${etag}`, 'If-None-Match 用弱比較：W/"x" 和 "x" 算相符（例如 CDN 壓縮後把 ETag 改成弱 ETag）'],
  ]
  for (const [header, why] of hit) {
    const r = await get(base, header)
    assert.equal(r.status, 304, `If-None-Match: ${header} 要回 304：${why}`)
  }
  for (const header of ['"nope"', `W/"nope", "x${Math.random()}"`, etag.slice(1, -1)]) {
    const r = await get(base, header)
    assert.equal(r.status, 200, `If-None-Match: ${header} 沒有相符的 ETag，要回 200`)
  }
})
