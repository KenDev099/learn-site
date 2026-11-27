import test from 'node:test'
import assert from 'node:assert/strict'
import { get, type IncomingHttpHeaders, type Server } from 'node:http'
import { gunzipSync } from 'node:zlib'
import { setTimeout as sleep } from 'node:timers/promises'
import { listen } from '../../helpers/http.ts'

const opts = { timeout: 15_000 }
type Order = { id: number, customer: string, total: number, orderedAt: string }
type Source = { listOrders: () => AsyncIterable<Order>, pulled: () => number, expected: string }

const NAMES = ['王小明', '陳美華', '林志豪', '張雅婷', '李建國', '黃淑芬']
const rand = (n: number) => Math.floor(Math.random() * n)

// 模擬資料庫游標：記錄被拉了幾筆；failAt 給了就在那一筆丟錯
function source(total: number, failAt?: number): Source {
  const start = 1000 + rand(9000)
  const t0 = Date.UTC(2026, 9, 1)
  const orders = (i: number): Order => ({ id: start + i, customer: NAMES[(i * 7 + start) % 6], total: 70 + ((i * 13 + start) % 50) * 10, orderedAt: new Date(t0 + i * 60_000).toISOString() })
  let pulled = 0
  return {
    async *listOrders() {
      for (let i = 0; i < total; i++) {
        if (i === failAt) throw new Error('資料庫連線中斷')
        pulled++
        yield orders(i)
      }
    },
    pulled: () => pulled,
    get expected() {
      let s = 'id,customer,total,ordered_at\n'
      for (let i = 0; i < total; i++) { const o = orders(i); s += `${o.id},${o.customer},${o.total},${o.orderedAt}\n` }
      return s
    },
  }
}

async function start(src: Source) {
  const mod: { createExportApp?: unknown } = await import('./export-app.ts')
  assert.equal(typeof mod.createExportApp, 'function', 'export-app.ts 要 export function createExportApp(listOrders)')
  const server = (mod.createExportApp as (l: Source['listOrders']) => Server)(src.listOrders)
  return (await listen(server)).url
}

// 用 node:http 下載整個檔案（fetch 會自己解壓縮，這裡要看原始的位元組）
// 結果：end（正常結束）、error（連線中斷）、timeout（10 秒還沒結束）
type Download = { kind: 'end', status: number, headers: IncomingHttpHeaders, body: Buffer } | { kind: 'error' | 'timeout', message: string }
function download(url: string, headers: Record<string, string> = {}) {
  return new Promise<Download>(resolve => {
    const timer = setTimeout(() => { resolve({ kind: 'timeout', message: '10 秒內沒有收完回應' }); req.destroy() }, 10_000)
    const fail = (e: Error) => { clearTimeout(timer); resolve({ kind: 'error', message: e.message }) }
    const req = get(url, { headers, agent: false }, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => { clearTimeout(timer); resolve({ kind: 'end', status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }) })
      res.on('error', fail)
    })
    req.on('error', fail)
  })
}

function completed(r: Download): asserts r is Extract<Download, { kind: 'end' }> {
  if (r.kind === 'timeout') assert.fail('10 秒內沒有收完回應，回應卡住了。如果你把含中文的「字串」寫進回應，可能碰到 Node 24.22 的 drain 回歸（課文「不是你的 bug 的時候」），改成寫 Buffer')
  if (r.kind === 'error') assert.fail(`下載時連線中斷：${r.message}`)
}

test('Accept-Encoding 沒有 gzip：不壓縮，CSV 內容完整，帶 Vary: Accept-Encoding', opts, async () => {
  const src = source(20_000 + rand(1000))
  const url = await start(src)
  for (const headers of [{}, { 'accept-encoding': 'br, deflate' }] as Record<string, string>[]) {
    const r = await download(url + '/orders/export.csv', headers)
    completed(r)
    assert.equal(r.status, 200)
    assert.match(String(r.headers['content-type']), /^text\/csv/, 'Content-Type 要是 text/csv; charset=utf-8')
    assert.equal(r.headers['content-encoding'], undefined, `請求的 Accept-Encoding 是 ${JSON.stringify(headers['accept-encoding'] ?? '（沒有帶）')}，裡面沒有 gzip，不能壓縮：要看標頭裡有沒有 gzip，不是有帶標頭就壓縮`)
    assert.match(String(r.headers.vary ?? ''), /accept-encoding/i, '回應內容會依 Accept-Encoding 不同，要帶 Vary: Accept-Encoding，不然快取可能把 gzip 版給不支援的客戶端')
    assert.ok(r.body.toString() === src.expected, `CSV 內容不對：開頭是 ${JSON.stringify(r.body.toString().slice(0, 80))}，要從標頭列 id,customer,total,ordered_at 開始，每筆一行`)
  }
})

test('Accept-Encoding: gzip：Content-Encoding: gzip，解壓後內容相同', opts, async () => {
  const src = source(5_000 + rand(1000))
  const url = await start(src)
  const r = await download(url + '/orders/export.csv', { 'accept-encoding': 'gzip, deflate, br' })
  completed(r)
  assert.equal(r.headers['content-encoding'], 'gzip', '客戶端帶 Accept-Encoding: gzip 時，要用 zlib.createGzip() 壓縮並帶 Content-Encoding: gzip')
  assert.match(String(r.headers.vary ?? ''), /accept-encoding/i, '壓縮的回應也要帶 Vary: Accept-Encoding')
  let text = ''
  try { text = gunzipSync(r.body).toString() } catch { assert.fail('回應說是 gzip，內容卻解不開') }
  assert.ok(text === src.expected, '解壓後的 CSV 內容不對')
  assert.ok(r.body.length < Buffer.byteLength(src.expected) / 2, '壓縮後應該小很多')
})

test('遵守背壓：客戶端暫停讀取時，不能把 50 萬筆訂單全部拉出來', opts, async () => {
  const total = 500_000
  const src = source(total)
  const url = await start(src)
  const req = get(url + '/orders/export.csv', { agent: false }, res => res.pause())
  req.on('error', () => {})
  // 先等伺服器開始拉資料，再等拉取的筆數停止增加（最多 3 秒）
  for (let i = 0; i < 50 && src.pulled() === 0; i++) await sleep(20)
  let last = -1
  for (let i = 0; i < 30 && src.pulled() !== last; i++) {
    last = src.pulled()
    await sleep(100)
  }
  const pulled = src.pulled()
  req.destroy()
  assert.ok(pulled < total / 2, `客戶端暫停讀取時，listOrders 被拉了 ${pulled} / ${total} 筆：沒有遵守背壓，資料全堆在記憶體裡。write() 回傳 false 要等 drain，或直接用 stream/promises 的 pipeline`)
})

test('listOrders 中途出錯：中斷連線，不能讓客戶端以為檔案完整', opts, async () => {
  const src = source(50_000, 5_000 + rand(1000))
  const url = await start(src)
  const cases = [{}, { 'accept-encoding': 'gzip' }] as Record<string, string>[]
  const results = await Promise.all(cases.map(headers => download(url + '/orders/export.csv', headers)))   // 同時下載，卡住時最多等 10 秒
  for (const [i, headers] of cases.entries()) {
    const r = results[i]
    assert.notEqual(r.kind, 'end', `listOrders 丟錯時，客戶端卻收到一個正常結束的回應（${JSON.stringify(headers)}）：殘缺的 CSV 會被當成完整的檔案。用 pipeline，出錯時它會銷毀 res、中斷連線`)
    assert.notEqual(r.kind, 'timeout', `listOrders 丟錯後，回應一直沒有結束，客戶端只能乾等（${JSON.stringify(headers)}）。.pipe() 不會把錯誤往下傳，改用 stream/promises 的 pipeline`)
  }
})
