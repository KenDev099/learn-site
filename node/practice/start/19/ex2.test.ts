import test from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
const hex = () => Math.random().toString(16).slice(2, 10)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DRINKS = ['美式咖啡', '拿鐵', '卡布奇諾', '伯爵紅茶']
type Entry = { msg?: string, requestId?: unknown, drink?: string }

async function start() {
  const mod: { createApp?: unknown } = await import('./app.ts')
  assert.equal(typeof mod.createApp, 'function', 'app.ts 要 export function createApp(write)')
  const lines: string[] = []
  const server = (mod.createApp as (w: (line: string) => void) => Server)(line => { lines.push(line) })
  const { url } = await listen(server)
  const entries = () => lines.join('').split('\n').filter(Boolean).map(l => JSON.parse(l) as Entry)
  return { url, entries }
}

async function brew(url: string, drink: string, ms: number, requestId?: string) {
  const headers: Record<string, string> = requestId === undefined ? {} : { 'x-request-id': requestId }
  const res = await fetch(`${url}/brew?drink=${encodeURIComponent(drink)}&ms=${ms}`, { headers, signal: AbortSignal.timeout(5000) })
  assert.equal(res.status, 200, `GET /brew 要回 200，收到 ${res.status}`)
  await res.body?.cancel()
  return res.headers.get('x-request-id')
}

// 每個 requestId 剛好 3 行（收到訂單、庫存確認、製作完成），而且每行的 drink 都是這個請求的
function checkLogs(entries: Entry[], expected: Map<string, string>) {
  for (const [id, drink] of expected) {
    const mine = entries.filter(e => e.requestId === id)
    assert.deepEqual(mine.map(e => e.msg), ['收到訂單', '庫存確認', '製作完成'],
      `requestId ${id}（${drink}）要剛好有 3 行 log：收到訂單、庫存確認、製作完成，實際是 ${JSON.stringify(mine.map(e => e.msg))}。` +
      '請求交錯時，log 掛到別的請求上了？監聽器是在 emit 的 context 執行的')
    for (const e of mine) assert.equal(e.drink, drink, `requestId ${id} 點的是 ${drink}，但「${e.msg}」這行寫成 ${e.drink}：這行 log 掛錯請求了`)
  }
  assert.equal(entries.length, expected.size * 3, `總共要有 ${expected.size * 3} 行 log，實際 ${entries.length} 行；有些行的 requestId 不屬於任何請求`)
}

test('20 個交錯的請求：每一行 log 的 requestId 都屬於正確的請求（含廚房事件的監聽器）', opts, async () => {
  const { url, entries } = await start()
  const expected = new Map<string, string>()
  const jobs = Array.from({ length: 20 }, (_, i) => {
    const id = `req-${hex()}-${i}`
    const drink = DRINKS[Math.floor(Math.random() * DRINKS.length)] + i
    expected.set(id, drink)
    return { id, drink, ms: 10 + (i % 4) * 25 }   // 同樣 ms 的請求會在同一批進廚房
  })
  const echoed = await Promise.all(jobs.map(j => brew(url, j.drink, j.ms, j.id)))
  jobs.forEach((j, i) => assert.equal(echoed[i], j.id, '格式合法的 x-request-id 要沿用，並放在回應標頭 x-request-id'))
  checkLogs(entries(), expected)
})

test('沒有或不合法的 x-request-id：自己產生 UUID，回應標頭和 log 用同一個', opts, async () => {
  const { url, entries } = await start()
  const bad = ['x'.repeat(65), 'a b', 'id"}', '', 'ok\tid']
  const sent = [undefined, undefined, ...bad]
  const ids = await Promise.all(sent.map((h, i) => brew(url, DRINKS[i % 4] + i, 5 + i * 3, h)))
  const expected = new Map<string, string>()
  ids.forEach((id, i) => {
    const what = sent[i] === undefined ? '沒帶 x-request-id' : `x-request-id 是 ${JSON.stringify(sent[i]).slice(0, 30)}`
    assert.ok(id && UUID.test(id), `${what}：要自己產生 UUID（crypto.randomUUID()）並放在回應標頭，收到 ${JSON.stringify(id)}。只接受英數字、-、_、.，長度 1 到 64`)
    expected.set(id, DRINKS[i % 4] + i)
  })
  assert.equal(new Set(ids).size, ids.length, '每個請求的 id 都要不一樣')
  checkLogs(entries(), expected)
  const ok = 'Abc_1.2-' + hex()
  assert.equal(await brew(url, '拿鐵', 1, ok), ok, `${ok} 是合法的（英數字、-、_、.），要沿用`)
})

test('用 AsyncLocalStorage：run 給每個請求一份 store，log 用 getStore() 取 requestId', opts, async () => {
  const src = (await readFile(join(import.meta.dirname, 'app.ts'), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  assert.match(src, /AsyncLocalStorage/, 'app.ts 要從 node:async_hooks 使用 AsyncLocalStorage（這題練的是它，不是一路傳參數）')
  assert.match(src, /\.run\(/, '每個請求要用 als.run(store, fn) 包住處理流程')
  assert.match(src, /\.getStore\(/, 'log 要用 als.getStore() 取得目前請求的 requestId，不是從閉包或參數拿')
})
