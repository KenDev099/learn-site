// 練習 1：/metrics 的 counter、histogram、gauge 都正確，label 只用路由樣板
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { join } from 'node:path'

const dir = join(import.meta.dirname, 'shop')
let p: ChildProcess
let out = ''
let base = ''

before(async () => {
  p = spawn(process.execPath, ['server.ts'], { cwd: dir, env: { ...process.env, PORT: '0' } })
  p.stdout!.on('data', d => out += d)
  p.stderr!.on('data', d => out += d)
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`server.ts 5 秒內沒有印出 listening：\n${out.slice(-1500)}`)), 5_000)
    p.stdout!.on('data', () => {
      const m = out.match(/listening on port (\d+)/)
      if (m) { clearTimeout(timer); resolve(Number(m[1])) }
    })
    p.on('close', () => reject(new Error(`server.ts 啟動就結束了，metrics.ts 可能有錯：\n${out.slice(-1500)}`)))
  })
  base = `http://127.0.0.1:${port}`
})
after(async () => {
  if (!p || p.exitCode !== null) return
  const closed = new Promise(r => p.on('close', r))
  p.kill('SIGTERM')
  const timer = setTimeout(() => p.kill('SIGKILL'), 3_000)
  await closed
  clearTimeout(timer)
})

type Sample = { name: string, labels: Record<string, string>, value: number }
// 解析 Prometheus 的文字格式：每行「名稱{label="值",…} 數值」，# 開頭的是說明
function parse(text: string) {
  const samples: Sample[] = []
  const types: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const t = line.match(/^# TYPE (\S+) (\S+)/)
    if (t) types[t[1]] = t[2]
    const m = line.match(/^([a-zA-Z_:][\w:]*)(?:\{(.*)\})? (\S+)/)
    if (!m) continue
    const labels: Record<string, string> = {}
    for (const [, k, v] of (m[2] ?? '').matchAll(/(\w+)="((?:[^"\\]|\\.)*)"/g)) labels[k] = v
    samples.push({ name: m[1], labels, value: Number(m[3]) })
  }
  return { samples, types }
}
const scrape = async () => {
  const res = await fetch(`${base}/metrics`)
  return { contentType: res.headers.get('content-type'), ...parse(await res.text()) }
}
const get = (path: string) => fetch(base + path).then(async r => { await r.text(); return r.status })
const pick = (s: Sample[], name: string, want: Record<string, string>) => s.filter(x => x.name === name && Object.entries(want).every(([k, v]) => x.labels[k] === v))
const one = (s: Sample[], name: string, want: Record<string, string>) => pick(s, name, want).reduce((a, x) => a + x.value, 0)

// 隨機的請求次數與訂單編號：寫死數字的實作過不了
const n = { order: randomInt(2, 6), notFound: randomInt(1, 3), nope: randomInt(2, 5), products: randomInt(1, 4) }
let done: Promise<void> | null = null
let duringSlow = NaN
function traffic() {
  done ??= (async () => {
    for (let i = 0; i < n.order; i++) assert.equal(await get(`/orders/${randomInt(1, 99999)}`), 200)
    for (let i = 0; i < n.notFound; i++) assert.equal(await get('/orders/abc'), 404)
    for (let i = 0; i < n.nope; i++) assert.equal(await get(`/nope/${randomInt(1e6)}`), 404)
    for (let i = 0; i < n.products; i++) assert.equal(await get('/products'), 200)
    assert.equal(await get('/boom'), 500)
    const slow = get('/slow?ms=200')
    await new Promise(r => setTimeout(r, 80))
    duringSlow = one((await scrape()).samples, 'http_requests_in_flight', {})
    assert.equal(await slow, 200)
    await new Promise(r => setTimeout(r, 50))
  })()
  return done
}

test('http_requests_total 依 method、route、status 精確計數', async () => {
  await traffic()
  const { samples, types } = await scrape()
  assert.equal(types.http_requests_total, 'counter', '找不到 counter http_requests_total：用 new Counter({ name: \'http_requests_total\', labelNames: [\'method\', \'route\', \'status\'], registers: [register] })')
  const c = (route: string, status: string) => one(samples, 'http_requests_total', { method: 'GET', route, status })
  assert.equal(c('/orders/:id', '200'), n.order, `GET /orders/:id 200 應該是 ${n.order}`)
  assert.equal(c('/orders/:id', '404'), n.notFound, `GET /orders/:id 404 應該是 ${n.notFound}`)
  assert.equal(c('unmatched', '404'), n.nope, `比對不到路由的請求（/nope/…）要記成 route="unmatched"，應該有 ${n.nope} 個`)
  assert.equal(c('/products', '200'), n.products, `GET /products 200 應該是 ${n.products}`)
  assert.equal(c('/boom', '500'), 1, 'GET /boom 丟出例外，server.ts 回了 500，要記成 status="500"：狀態碼要等回應送出（res 的 finish 事件）時再讀')
})

test('route label 只有路由樣板：沒有 /orders/123 這種實際網址', async () => {
  await traffic()
  const { samples } = await scrape()
  const routes = new Set(samples.filter(s => s.name.startsWith('http_request')).map(s => s.labels.route).filter(Boolean))
  const bad = [...routes].filter(r => !['/products', '/orders/:id', '/slow', '/boom', 'unmatched'].includes(r))
  assert.deepEqual(bad, [], `route label 出現了 ${bad.slice(0, 3).join('、')}：每個不同的值都是一條新的時間序列，用網址當 label，訂單一多序列數就爆炸。用 server.ts 傳進來的樣板`)
  assert.ok(routes.has('/orders/:id'), 'route label 裡找不到 /orders/:id')
})

test('http_request_duration_seconds 是以秒為單位的 histogram，桶子累加正確', async () => {
  await traffic()
  const { samples, types } = await scrape()
  assert.equal(types.http_request_duration_seconds, 'histogram', `http_request_duration_seconds 的型別是 ${types.http_request_duration_seconds ?? '（找不到）'}：要用 Histogram。Summary 在程式裡算好百分位數，多個副本的結果不能合併`)
  const buckets = pick(samples, 'http_request_duration_seconds_bucket', { method: 'GET', route: '/slow' })
  const les = buckets.map(b => b.labels.le)
  assert.deepEqual(les, ['0.005', '0.01', '0.025', '0.05', '0.1', '0.25', '0.5', '1', '2.5', '5', '+Inf'], `/slow 的桶子是 ${les.join(', ')}：buckets 要是 [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5]，單位是秒`)
  const at = (le: string) => buckets.find(b => b.labels.le === le)!.value
  assert.equal(at('0.1'), 0, '200ms 的請求不該落在 le="0.1"')
  assert.equal(at('0.25'), 1, '200ms 的請求要落在 le="0.25"（0.2 秒）：名稱寫 _seconds 就要記秒，不要記毫秒')
  const sum = one(samples, 'http_request_duration_seconds_sum', { route: '/slow' })
  assert.ok(sum > 0.18 && sum < 1, `/slow 的 _sum 是 ${sum}：200ms 應該記成 0.2 左右`)
  for (const route of ['/orders/:id', '/products', 'unmatched', '/boom']) {
    const b = pick(samples, 'http_request_duration_seconds_bucket', { method: 'GET', route })
    assert.ok(b.length, `${route} 沒有耗時的紀錄`)
    for (let i = 1; i < b.length; i++) assert.ok(b[i].value >= b[i - 1].value, `${route} 的桶子要是累加的（le 越大數字越大）`)
    const count = one(samples, 'http_request_duration_seconds_count', { method: 'GET', route })
    assert.equal(b.at(-1)!.value, count, `${route} 的 le="+Inf" 要等於 _count`)
    assert.equal(count, one(samples, 'http_requests_total', { method: 'GET', route }), `${route} 的耗時次數要跟 http_requests_total 一樣：例外的請求也要記耗時`)
  }
})

test('http_requests_in_flight 處理中是 1，結束後回到 0（丟例外也一樣）', async () => {
  await traffic()
  const { types, samples } = await scrape()
  assert.equal(types.http_requests_in_flight, 'gauge', '找不到 gauge http_requests_in_flight')
  assert.equal(duringSlow, 1, `/slow 處理中時 in_flight 應該是 1，實際是 ${duringSlow}`)
  assert.equal(one(samples, 'http_requests_in_flight', {}), 0, '請求都結束了，in_flight 應該回到 0：/boom 丟出例外時 await handle() 後面的程式不會執行，dec() 要放在 finally')
})

test('有預設指標，Content-Type 是 Prometheus 的文字格式', async () => {
  await traffic()
  const { contentType, types } = await scrape()
  assert.equal(contentType, 'text/plain; version=0.0.4; charset=utf-8')
  for (const name of ['process_cpu_seconds_total', 'nodejs_eventloop_lag_seconds', 'nodejs_heap_size_used_bytes'])
    assert.ok(types[name], `找不到預設指標 ${name}：呼叫 collectDefaultMetrics({ register })`)
})
