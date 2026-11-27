// 練習 4：用到達率壓測找出容量，寫成上線門檻；門檻要能放行健康的版本、擋下連線池變小的版本
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docker, readJson, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const K6 = 'grafana/k6:2.3.0'
const NODE = 'node:24.22.2-alpine3.24'
const METRICS = 'http://127.0.0.1:18220/metrics'
// api/server.ts：9 成 GET /products 占用連線 40ms、1 成 POST /orders 占用 80ms，連線池 5 條
// → 平均每個請求占用 44ms，5 條連線每秒最多處理 5 / 0.044 ≈ 113 個請求（理論上限，實測一定更低）
const THEORETICAL_MAX = 5 / (0.9 * 0.04 + 0.1 * 0.08)

const compose = (args: string[], env: Record<string, string> = {}) =>
  run('docker', ['compose', '-p', 'ld-22', ...args], { cwd: dir, env, timeout: 180_000 })
const down = () => { docker('rm', '-f', 'ld-22-k6'); compose(['down', '-v', '--remove-orphans']) }

before(() => {
  requireDocker()
  for (const image of [K6, NODE]) if (docker('image', 'inspect', image).code !== 0) {
    const r = run('docker', ['pull', image], { timeout: 600_000 })
    if (r.code !== 0) throw new Error(`下載 ${image} 失敗：${r.stderr.split('\n').at(-1)}`)
  }
  down()
})
after(down)

// k6 inspect 印出腳本最後算出來的 options（JSON），不用真的跑
function inspect(file: string): any {
  assert.ok(existsSync(join(dir, file)), `找不到 ${file}`)
  const r = docker('run', '--rm', '-v', `${dir}:/scripts:ro`, '-w', '/scripts', K6, 'inspect', file)
  assert.equal(r.code, 0, `k6 inspect ${file} 失敗，腳本有語法錯誤：\n${r.stderr.slice(-800)}`)
  return JSON.parse(r.stdout)
}
// "1m10s"、"30s"、"500ms" → 秒
function sec(d: unknown): number {
  if (typeof d === 'number') return d / 1e9
  let total = 0
  for (const [, n, u] of String(d ?? '0s').matchAll(/([\d.]+)(ms|h|m|s)/g)) total += Number(n) * { ms: 0.001, s: 1, m: 60, h: 3600 }[u]!
  return total
}
const ARRIVAL = ['constant-arrival-rate', 'ramping-arrival-rate']
const lengthOf = (s: any) => s.executor === 'constant-arrival-rate' ? sec(s.duration) : (s.stages ?? []).reduce((a: number, x: any) => a + sec(x.duration), 0)
// 每秒的到達率：constant 用 rate，ramping 用最後一個 stage 的 target
const rpsOf = (s: any) => (s.executor === 'constant-arrival-rate' ? s.rate : s.stages?.at(-1)?.target) / sec(s.timeUnit ?? '1s')
const norm = (list: unknown) => (Array.isArray(list) ? list : []).map(t => String(typeof t === 'object' && t ? (t as any).threshold : t).replace(/\s+/g, ''))

// 計分的階段：除了 warmup 以外的 scenario，依到達率排序
function steps() {
  const o = inspect('loadtest.js')
  const all = Object.entries<any>(o.scenarios ?? {})
  assert.ok(all.length, 'loadtest.js 沒有任何 scenario')
  for (const [name, s] of all) assert.ok(ARRIVAL.includes(s.executor),
    `scenario ${name} 用的是 ${s.executor}：這是封閉模型，系統變慢時每個 VU 要等回應才送下一個，送出的請求跟著變少，量到的延遲會太好看（協調遺漏）。用 constant-arrival-rate 或 ramping-arrival-rate`)
  const warmup = o.scenarios.warmup
  assert.ok(warmup, '找不到名為 warmup 的 scenario：冷啟動時 JIT、連線、快取都還沒熱，前 30 秒要先暖機、不計分')
  assert.ok(sec(warmup.startTime) === 0 && lengthOf(warmup) >= 30, 'warmup 要從 0 秒開始、至少跑 30 秒')
  const measured = all.filter(([name]) => name !== 'warmup')
  assert.ok(measured.length >= 3, '暖機之後至少要有 3 階不同的到達率，才看得出延遲從哪裡開始變差')
  for (const [name, s] of measured) {
    assert.ok(sec(s.startTime) >= lengthOf(warmup), `scenario ${name} 在暖機結束前就開始了（startTime ${s.startTime ?? '0s'}）：計分的階段要排在 warmup 之後`)
    assert.ok(o.thresholds?.[`http_req_duration{scenario:${name}}`], `沒有 http_req_duration{scenario:${name}} 的門檻：k6 只替設了門檻的子指標算數字，摘要裡才看得到這一階（不含暖機）的 p95`)
  }
  assert.match(readFileSync(join(dir, 'loadtest.js'), 'utf8'), /export\s+function\s+handleSummary/, 'loadtest.js 要保留 handleSummary，把摘要寫到 summary.json')
  return measured.map(([name, s]) => ({ name, rps: rpsOf(s) })).sort((a, b) => a.rps - b.rps)
}

test('loadtest.js 用到達率逐步加壓，前 30 秒暖機不計分', () => {
  steps()
})

test('capacity.json 的數字來自 summary.json 裡實測的某一階', () => {
  const list = steps()
  const cap = readJson(dir, 'capacity.json')
  const max = cap.maxRpsWithinSlo
  assert.equal(typeof max, 'number', 'capacity.json 的 maxRpsWithinSlo 要是數字（每秒請求數）')
  const i = list.findIndex(s => Math.abs(s.rps - max) < 1e-6)
  assert.ok(i >= 0, `maxRpsWithinSlo 是 ${max}，可是 loadtest.js 量過的到達率是 ${list.map(s => s.rps).join('、')}：要填實際量過、而且符合 SLO 的那一階，不是 VU 數、平均延遲或估計值`)
  assert.ok(max <= THEORETICAL_MAX, `${max} 個請求／秒超過連線池的理論上限（約 ${Math.floor(THEORETICAL_MAX)}）`)
  const summary = readJson(dir, 'summary.json')
  const m = (metric: string, step: string) => summary.metrics?.[`${metric}{scenario:${step}}`]?.values
  const ok = (step: string) => {
    const d = m('http_req_duration', step), f = m('http_req_failed', step), dropped = m('dropped_iterations', step)?.count ?? 0
    return !!d && d['p(95)'] < 300 && (f?.rate ?? 0) < 0.001 && dropped === 0
  }
  const step = list[i].name
  const d = m('http_req_duration', step)
  assert.ok(d, `summary.json 裡沒有 http_req_duration{scenario:${step}}：先跑一次 loadtest.js（它會寫出 summary.json）`)
  assert.ok(ok(step), `${step} 這一階沒有符合 SLO（p95 ${Math.round(d['p(95)'])}ms、錯誤率、dropped_iterations 要是 0）：maxRpsWithinSlo 要填有過的那一階`)
  const next = list[i + 1]
  if (next && m('http_req_duration', next.name)) assert.ok(!ok(next.name), `更高的 ${next.name} 也符合 SLO：maxRpsWithinSlo 要填「最大」的那一階，或再往上加壓`)
  assert.ok(Math.abs(cap.p95Ms - d['p(95)']) <= 1, `p95Ms 要是這一階的 p(95)：${d['p(95)'].toFixed(1)}`)
  assert.ok(d['p(99)'] !== undefined, 'summary.json 沒有 p(99)：options.summaryTrendStats 要包含 p(99)')
  assert.ok(Math.abs(cap.p99Ms - d['p(99)']) <= 1, `p99Ms 要是這一階的 p(99)：${d['p(99)'].toFixed(1)}`)
  assert.ok(Math.abs(cap.errorRate - (m('http_req_failed', step)?.rate ?? 0)) < 1e-9, 'errorRate 要是這一階的 http_req_failed rate')
})

// 上線門檻的設定：從 capacity.json 算出來
function gate() {
  const cap = readJson(dir, 'capacity.json')
  const o = inspect('gate.js')
  const all = Object.entries<any>(o.scenarios ?? {})
  assert.ok(all.length, 'gate.js 沒有任何 scenario')
  for (const [name, s] of all) {
    assert.equal(s.executor, 'constant-arrival-rate', `gate.js 的 ${name} 要用 constant-arrival-rate：門檻要在固定的到達率下判斷`)
    const want = 0.7 * cap.maxRpsWithinSlo
    assert.ok(Math.abs(rpsOf(s) - want) <= want * 0.1, `${name} 的到達率是每秒 ${rpsOf(s)}，應該是 0.7 × maxRpsWithinSlo ≈ ${want.toFixed(1)}：留 30% 餘裕給尖峰和量測誤差`)
    assert.ok(sec(s.duration) >= 20, `${name} 至少要跑 20 秒`)
  }
  const t = o.thresholds ?? {}
  assert.ok(norm(t.http_req_duration).includes('p(95)<300'), 'gate.js 要有門檻 http_req_duration: [\'p(95)<300\']')
  assert.ok(norm(t.http_req_failed).includes('rate<0.001'), 'gate.js 要有門檻 http_req_failed: [\'rate<0.001\']：只看延遲，錯誤回得很快的版本反而會過關')
  assert.ok(norm(t.dropped_iterations).includes('count==0'), 'gate.js 要有門檻 dropped_iterations: [\'count==0\']：有請求沒送出去時，量到的延遲不可信')
}

test('gate.js：0.7 × maxRpsWithinSlo 的固定到達率，三個門檻都有', () => {
  gate()
})

// 用指定的連線池大小啟動 api，在 compose 網路的另一個容器跑 gate.js；同時每 0.5 秒讀一次 /metrics
async function runGate(pool: number) {
  down()
  const up = compose(['up', '-d', '--wait', '--wait-timeout', '60'], { POOL_SIZE: String(pool) })
  assert.equal(up.code, 0, `docker compose -p ld-22 up 失敗：\n${up.stderr.slice(-800)}`)
  // 先暖機幾秒再跑門檻：剛啟動的容器前幾個請求比較慢，不該算進 gate.js 的 p95
  const warmUntil = Date.now() + 3_000
  while (Date.now() < warmUntil) await Promise.all(Array.from({ length: 5 }, () => fetch('http://127.0.0.1:18220/products').then(r => r.text()).catch(() => {})))
  let maxWaiting = 0, out = ''
  const poll = setInterval(async () => {
    try {
      const m = (await (await fetch(METRICS, { signal: AbortSignal.timeout(1_000) })).text()).match(/^db_pool_waiting (\S+)/m)
      if (m) maxWaiting = Math.max(maxWaiting, Number(m[1]))
    } catch {}
  }, 500)
  const p = spawn('docker', ['run', '--rm', '--name', 'ld-22-k6', '--network', 'ld-22_default', '-v', `${dir}:/scripts`, '-w', '/scripts', K6, 'run', '--quiet', 'gate.js'])
  p.stdout.on('data', d => out += d)
  p.stderr.on('data', d => out += d)
  const code = await new Promise<number | null>(resolve => {
    const timer = setTimeout(() => { docker('rm', '-f', 'ld-22-k6'); resolve(null) }, 180_000)
    p.on('close', c => { clearTimeout(timer); resolve(c) })
  })
  clearInterval(poll)
  return { code, maxWaiting, out: out.split('\n').filter(l => /http_req_duration|http_req_failed|dropped_iterations|level=error/.test(l)).join('\n') }
}

test('資源充足（連線池 20 條）時 gate.js 放行：exit 0', { timeout: 300_000 }, async () => {
  assert.doesNotThrow(gate, '先讓上一個測試（gate.js 的設定）通過')
  const r = await runGate(20)
  assert.equal(r.code, 0, `連線池充足時 gate.js 應該通過，k6 卻以 ${r.code} 結束：preAllocatedVUs 要夠（到達率 × 最慢可接受的秒數，再留餘裕），網址要是 http://api:3000\n${r.out}`)
})

// 連線池 1 條的理論上限約每秒 22 個請求，遠低於 0.7 × maxRpsWithinSlo：不管機器快慢都一定撐不住
test('連線池剩 1 條時 gate.js 擋下（exit 99），瓶頸記錄成連線池', { timeout: 300_000 }, async () => {
  assert.doesNotThrow(gate, '先讓 gate.js 的設定通過')
  const r = await runGate(1)
  assert.equal(r.code, 99, `連線池剩 1 條時 gate.js 應該因為門檻沒過以 99 結束，實際是 ${r.code}\n${r.out}`)
  assert.ok(r.maxWaiting > 0, '壓測期間 db_pool_waiting 一直是 0：k6 有打到 api 嗎？')
  const cap = readJson(dir, 'capacity.json')
  assert.equal(cap.bottleneck, 'pool', `飽和時 db_pool_waiting 最高到 ${r.maxWaiting}、CPU 卻很閒：bottleneck 應該是 pool`)
  assert.equal(cap.evidence?.metric, 'db_pool_waiting', 'evidence.metric 要寫你看到的那個指標名稱 db_pool_waiting')
  assert.ok(typeof cap.evidence?.value === 'number' && cap.evidence.value > 0, 'evidence.value 要是你在飽和時讀到的 db_pool_waiting（大於 0 的數字）')
})
