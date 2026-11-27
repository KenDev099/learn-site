// 產生咖啡店的 NDJSON log（api 與 kitchen 混在一起），練習 2 的測試用它產生新的資料
// 自己產生一份來試：node loggen.ts 5000 7 > logs/mine.log（5000 個請求、seed 7）
// 同一個 seed 每次產生的內容都一樣

// mulberry32：簡單、可重現的亂數產生器
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ROUTES = [
  { method: 'GET', route: '/products', path: () => '/products', weight: 30, fail: 0.002 },
  { method: 'GET', route: '/orders/:id', path: (r: () => number) => `/orders/${1 + Math.floor(r() * 5000)}`, weight: 25, fail: 0.01 },
  { method: 'POST', route: '/orders', path: () => '/orders', weight: 20, fail: 0 },
  { method: 'GET', route: '/cart', path: () => '/cart', weight: 15, fail: 0.004 },
  { method: 'POST', route: '/cart/items', path: () => '/cart/items', weight: 10, fail: 0.02 },
]

// 同一個時間點，一半寫成 UTC（Z），一半寫成台灣時間（+08:00）：兩台機器的設定不同時就會這樣
function stamp(ms: number, r: () => number) {
  if (r() < 0.5) return new Date(ms).toISOString()
  return new Date(ms + 8 * 3600_000).toISOString().replace('Z', '+08:00')
}

export function generate(requests: number, seed: number): string {
  const r = rng(seed)
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('')
  const total = ROUTES.reduce((s, x) => s + x.weight, 0)
  const lines: { at: number, line: string }[] = []
  const base = Date.UTC(2026, 10, 1, 2, 0, 0)
  const emit = (ms: number, obj: Record<string, unknown>) => {
    // 收集器分批送出，檔案裡的順序跟實際發生的時間差了最多 0.3 秒
    lines.push({ at: ms + r() * 300, line: JSON.stringify({ level: 30, ts: stamp(ms, r), env: 'production', ...obj }) })
  }
  for (let i = 0; i < requests; i++) {
    let pick = r() * total
    const rt = ROUTES.find(x => (pick -= x.weight) < 0) ?? ROUTES[0]
    const id = `req-${hex(12)}`
    const t = base + i * 40 + Math.floor(r() * 30)
    const api = { service: 'api', version: '1.6.0', request_id: id }
    let dur = Math.round((3 + r() * r() * 400) * 10) / 10
    let status = r() < rt.fail ? 500 : 200
    if (rt.route === '/orders/:id' && r() < 0.08) status = 404
    if (rt.method === 'POST') status = status === 200 ? 201 : status
    emit(t + 2, { ...api, level: 20, msg: 'db query', duration_ms: Math.round(r() * 20 * 10) / 10 })
    if (rt.route === '/orders') {
      const kd = Math.round((2 + r() * r() * 600) * 10) / 10
      const kStatus = r() < 0.03 ? 503 : 201
      const kitchen = { service: 'kitchen', version: '0.9.2', request_id: id }
      emit(t + 5, { ...kitchen, msg: 'ticket queued' })
      emit(t + 6 + Math.ceil(kd), { ...kitchen, msg: 'request', method: 'POST', route: '/tickets', path: '/tickets', status: kStatus, duration_ms: kd })
      dur = Math.round((Math.ceil(kd) + 8 + r() * 50) * 10) / 10
      if (kStatus === 503) {
        status = 502
        emit(t + 7 + Math.ceil(kd), { ...api, level: 50, msg: 'kitchen unavailable', err: { type: 'Error', message: 'kitchen responded 503' } })
        // 有人用 console.log 印了 stack trace：一個錯誤被拆成好幾行，而且不是 JSON
        lines.push({ at: t + 8 + Math.ceil(kd), line: 'Error: kitchen responded 503' })
        lines.push({ at: t + 8 + Math.ceil(kd), line: '    at callKitchen (/app/dist/kitchen.js:31:11)' })
      }
    }
    const path = rt.path(r)
    emit(t + Math.ceil(dur) + 10, { ...api, msg: 'request', method: rt.method, route: rt.route, path, status, duration_ms: dur })
  }
  lines.sort((a, b) => a.at - b.at)
  return lines.map(l => l.line).join('\n') + '\n'
}

if (import.meta.main) process.stdout.write(generate(Number(process.argv[2] ?? 2000), Number(process.argv[3] ?? 21)))
