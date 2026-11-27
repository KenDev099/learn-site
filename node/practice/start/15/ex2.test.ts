import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Item = { id: number, name: string, nameEn: string, price: number }
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]

const [zh, en] = pick([['特調', 'Special'], ['大杯', 'Large'], ['燕麥', 'Oat']])
const menu: Item[] = [['拿鐵', 'Latte'], ['可頌', 'Croissant']].map(([n, e], i) => ({
  id: i + 1, name: n + zh, nameEn: `${e} ${en}`, price: 60 + Math.floor(Math.random() * 60),
}))
const zhBody = menu.map(({ id, name, price }) => ({ id, name, price }))
const enBody = menu.map(({ id, nameEn, price }) => ({ id, name: nameEn, price }))

async function start() {
  const mod: { createApp?: unknown } = await import('./menu-lang.ts')
  assert.equal(typeof mod.createApp, 'function', 'menu-lang.ts 要 export function createApp(menu)')
  return (await listen((mod.createApp as (m: Item[]) => Server)(menu))).url
}

async function get(base: string, lang?: string, ifNoneMatch?: string) {
  const headers: Record<string, string> = {}
  if (lang !== undefined) headers['accept-language'] = lang
  if (ifNoneMatch !== undefined) headers['if-none-match'] = ifNoneMatch
  const res = await fetch(base + '/menu', { headers, signal: AbortSignal.timeout(3000) })
  const text = await res.text()
  const h = (k: string) => res.headers.get(k)
  return { status: res.status, text, etag: h('etag'), lang: h('content-language'), vary: h('vary') }
}

const varies = (v: string | null) => (v ?? '').split(',').some(s => s.trim().toLowerCase() === 'accept-language')

const cases: [string | undefined, 'zh' | 'en', string][] = [
  [undefined, 'zh', '沒有 Accept-Language 時用預設的 zh-TW'],
  ['zh-TW', 'zh', ''],
  ['en', 'en', ''],
  ['en-US', 'en', 'en-US 是英文的一種，要對到 en（看主要的語言代碼）'],
  ['EN-gb', 'en', '語言代碼不分大小寫'],
  ['ja', 'zh', '不支援的語言用預設的 zh-TW'],
  ['fr, en;q=0.5', 'en', '第一個 fr 不支援，往下找到 en'],
  ['en;q=0.4, zh-TW;q=0.9', 'zh', '要依 q 值由高到低選，不是照出現的順序'],
  ['de;q=1, en-US;q=0.8, zh;q=0.7', 'en', 'q 值最高的 de 不支援，接著是 en-US'],
  ['zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7', 'zh', '瀏覽器常見的寫法'],
  ['en;q=0, ja', 'zh', 'q=0 代表「不要這個語言」，要跳過'],
]

test('依 Accept-Language 選語言，回應帶 Content-Language', opts, async () => {
  const base = await start()
  for (const [header, want, why] of cases) {
    const r = await get(base, header)
    const label = header === undefined ? '沒有 Accept-Language' : `Accept-Language: ${header}`
    assert.equal(r.status, 200, `${label} 要回 200`)
    assert.deepEqual(JSON.parse(r.text), want === 'en' ? enBody : zhBody, `${label} 要回${want === 'en' ? '英文' : '中文'}品名，每項是 { id, name, price }。${why}`)
    assert.equal(r.lang, want === 'en' ? 'en' : 'zh-TW', `${label} 的 Content-Language 要是 ${want === 'en' ? 'en' : 'zh-TW'}`)
  }
})

test('回應帶 Vary: Accept-Language，兩種語言的 ETag 不同', opts, async () => {
  const base = await start()
  const z = await get(base, 'zh-TW'), e = await get(base, 'en')
  for (const r of [z, e]) {
    assert.ok(varies(r.vary), `回應要帶 Vary: Accept-Language（收到 ${r.vary}），快取才知道同一個網址要依語言分開存`)
    assert.match(r.etag ?? '', /^"[\x21\x23-\x7e]+"$/, 'ETag 要用雙引號包起來（用練習 1 的 etagOf）')
  }
  assert.notEqual(z.etag, e.etag, '中文版和英文版內容不同，ETag 也要不同：用這個語言版本的內容算 ETag')
  const again = await get(base, 'en-US')
  assert.equal(again.etag, e.etag, '同一個語言版本，ETag 要一樣')
})

test('條件請求也要看語言：304 帶 Vary，別的語言的 ETag 拿到 200', opts, async () => {
  const base = await start()
  const z = await get(base, 'zh-TW'), e = await get(base, 'en')
  const hit = await get(base, 'en', e.etag ?? undefined)
  assert.equal(hit.status, 304, '帶英文版的 ETag、要英文：回 304（用練習 1 的 noneMatch）')
  assert.ok(varies(hit.vary), '304 也要帶 Vary: Accept-Language')
  const miss = await get(base, 'en', z.etag ?? undefined)
  assert.equal(miss.status, 200, '手上是中文版的 ETag、現在要英文：不能回 304')
  assert.deepEqual(JSON.parse(miss.text), enBody)
})
