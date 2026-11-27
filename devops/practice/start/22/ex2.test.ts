// 練習 2：三個 recording rule 在多副本、counter 重設、流量不均時都算對
// 用 prom/prometheus:v3.15.1 裡的 promtool test rules：餵假的時間序列，在幾個時間點比對規則的結果
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { docker, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'prom/prometheus:v3.15.1'
const tmp = mkdtempSync(join(tmpdir(), 'ld-22-rules-'))

before(() => {
  requireDocker()
  if (docker('image', 'inspect', IMAGE).code !== 0) {
    const r = run('docker', ['pull', IMAGE], { timeout: 300_000 })
    if (r.code !== 0) throw new Error(`下載 ${IMAGE} 失敗：${r.stderr.split('\n').at(-1)}`)
  }
})
after(() => rmSync(tmp, { recursive: true, force: true }))

// 兩個副本（a 流量小、b 流量大）、兩個路由；b 的 /products 在第 11 分鐘重啟（counter 歸零）；
// a 的 /orders/:id 在第 10 分鐘之後流量變三倍，所以 rate 跟 irate 不同
const SERIES = [
  ['http_requests_total{instance="a",route="/products",status="200"}', '0+60x10 600+120x20'],
  ['http_requests_total{instance="a",route="/products",status="500"}', '0+6x30'],
  ['http_requests_total{instance="b",route="/products",status="200"}', '0+600x10 0+600x20'],
  ['http_requests_total{instance="b",route="/products",status="500"}', '0+1x10 0+2x20'],
  ['http_requests_total{instance="b",route="/products",status="404"}', '0+30x30'],
  ['http_requests_total{instance="a",route="/orders/:id",status="201"}', '0+30x10 300+90x20'],
  ['http_requests_total{instance="a",route="/orders/:id",status="503"}', '0+12x30'],
  ['http_requests_total{instance="b",route="/orders/:id",status="201"}', '0+240x30'],
  ['http_requests_total{instance="b",route="/orders/:id",status="502"}', '0+3x30'],
]
const BUCKETS: Record<string, Record<string, number[]>> = {   // 每分鐘每個桶子增加多少（累加的）
  a: { '/products': [50, 55, 58, 60, 60], '/orders/:id': [5, 20, 28, 30, 31] },
  b: { '/products': [300, 500, 560, 590, 600], '/orders/:id': [100, 180, 220, 238, 240] },
}
for (const [inst, routes] of Object.entries(BUCKETS)) for (const [route, inc] of Object.entries(routes))
  ['0.1', '0.25', '0.5', '1.0', '+Inf'].forEach((le, i) => SERIES.push([`http_request_duration_seconds_bucket{instance="${inst}",route="${route}",le="${le}"}`, `0+${inc[i]}x30`]))

const CASES: [string, string, string][] = [
  ['route:http_requests:rate5m', 'sum by (route) (rate(http_requests_total[5m]))',
    '每秒請求數算錯了。用 rate(…[5m])（不是 irate：irate 只看最後兩個點；也不是沒除秒數的 increase），再 sum by (route) 把副本與狀態碼加起來'],
  ['route:http_errors:ratio_rate5m', 'sum by (route) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (route) (rate(http_requests_total[5m]))',
    '錯誤比例算錯了。分子是 5xx（status=~"5.."，404 不算）的 rate 加總、分母是全部的 rate 加總：先各自 sum by (route) 再相除，不要把每個副本的比例取平均'],
  ['route:http_request_duration_seconds:p95_5m', 'histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))',
    'p95 算錯了。histogram_quantile 之前要先 sum by (le, route) 把各副本的桶子加起來（le 一定要留著），不能各算各的再平均'],
]

// 拿學習者的規則跟正確的算式比：兩邊的 label 必須完全一樣（只有 route），值的差小於 1e-9。
// 三個規則放在同一個測試檔，只跑一次 promtool；每個規則一個 test group，從輸出看哪個沒過
let result: { code: number | null, out: string } | null = null
function promtoolTest() {
  if (result) return result
  writeFileSync(join(tmp, 'test.yml'), JSON.stringify({
    rule_files: ['/w/rules.yml'], evaluation_interval: '1m',
    tests: CASES.map(([rule, reference]) => ({
      name: rule, interval: '1m',
      input_series: SERIES.map(([series, values]) => ({ series, values })),
      promql_expr_test: [12, 13, 15, 25].map(m => ({
        expr: `abs(${rule} - (${reference})) < bool 1e-9`,
        eval_time: `${m}m`,
        exp_samples: ['/products', '/orders/:id'].map(r => ({ labels: `{route="${r}"}`, value: 1 })),
      })),
    })),
  }))
  const r = docker('run', '--rm', '--entrypoint', '/bin/promtool', '-v', `${dir}:/w:ro`, '-v', `${tmp}:/t:ro`, IMAGE, 'test', 'rules', '/t/test.yml')
  return result = { code: r.code, out: (r.stdout + '\n' + r.stderr).trim() }
}

function records(): Set<string> {
  let doc: any
  try { doc = parse(readFileSync(join(dir, 'rules.yml'), 'utf8')) } catch (e) { throw new Error(`rules.yml 讀不到或不是合法的 YAML：${(e as Error).message}`) }
  return new Set((doc?.groups ?? []).flatMap((g: any) => g.rules ?? []).map((r: any) => r.record).filter(Boolean))
}

// promtool 的輸出裡，這個規則沒過的時間點（每個是 expr／exp／got 三行）
const failures = (out: string, name: string) => out.split(/\n(?=\s*expr: )/).filter(b => b.includes(`abs(${name} `)).map(b => b.trim())

test('rules.yml 能被 Prometheus 載入', () => {
  const r = promtoolTest()
  assert.ok(r.code === 0 || /expr: "abs\(/.test(r.out), `promtool 載入 rules.yml 失敗（YAML 格式或 PromQL 語法錯誤）：\n${r.out.slice(0, 1200)}`)
})

for (const [name, , hint] of CASES) test(`${name} 在第 12、13、15、25 分鐘都算對`, () => {
  assert.ok(records().has(name), `rules.yml 裡找不到 record: ${name}`)
  const bad = failures(promtoolTest().out, name)
  assert.equal(bad.length, 0, `${hint}。\n結果只能有 route 一個 label。exp 是應該得到的，got 是 1 代表那個 route 算對、0 代表算錯、沒出現代表 label 對不上：\n${bad.slice(0, 2).join('\n')}`)
})
