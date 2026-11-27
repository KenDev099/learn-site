// 練習 4：壓測驗收：以 NEEDS.md 的尖峰到達率，經過 nginx 與 TLS 打整套類正式環境
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { docker, requireDocker, run } from '../../helpers/docker.ts'
import { dc, reset, runAsync, up, why } from './lib.ts'

const dir = import.meta.dirname
const K6 = 'grafana/k6:2.3.0'
const PEAK = 12 * 3          // NEEDS.md：現在的尖峰每秒 12 個請求，會員上線後三倍
let ready = ''

before(() => {
  requireDocker()
  reset(dir)
  if (docker('image', 'inspect', K6).code !== 0) {
    const r = run('docker', ['pull', K6], { timeout: 600_000 })
    if (r.code !== 0) { ready = `下載 ${K6} 失敗：${r.stderr.split('\n').at(-1)}`; return }
  }
  const u = up(dir)
  if (u.code !== 0) ready = `sh up.sh 失敗（結束碼 ${u.code}，先完成練習 1、2）：\n${why(u)}`
})
after(() => reset(dir))

// "1m30s"、"30s"、"500ms" → 秒
function sec(d: unknown): number {
  if (typeof d === 'number') return d / 1e9
  let total = 0
  for (const [, n, u] of String(d ?? '0s').matchAll(/([\d.]+)(ms|h|m|s)/g)) total += Number(n) * { ms: 0.001, s: 1, m: 60, h: 3600 }[u]!
  return total
}
const norm = (list: unknown) => (Array.isArray(list) ? list : []).map(t => String(typeof t === 'object' && t ? (t as any).threshold : t).replace(/\s+/g, ''))

// k6 inspect 印出腳本算出來的 options，不用真的跑
function options() {
  assert.ok(existsSync(join(dir, 'loadtest', 'gate.js')), '找不到 loadtest/gate.js')
  const r = docker('run', '--rm', '-v', `${join(dir, 'loadtest')}:/scripts:ro`, '-w', '/scripts', K6, 'inspect', 'gate.js')
  assert.equal(r.code, 0, `k6 inspect gate.js 失敗，腳本有語法錯誤：\n${r.stderr.slice(-800)}`)
  return JSON.parse(r.stdout)
}

function checkOptions() {
  const o = options()
  const all = Object.entries<any>(o.scenarios ?? {})
  assert.ok(all.length, 'gate.js 沒有任何 scenario')
  for (const [name, s] of all) {
    assert.equal(s.executor, 'constant-arrival-rate', `scenario ${name} 用的是 ${s.executor}：VU 模型在系統變慢時會自動少送請求，量到的延遲太好看（第 22 課的協調遺漏）。用 constant-arrival-rate`)
    const rps = s.rate / sec(s.timeUnit ?? '1s')
    assert.ok(rps >= PEAK, `${name} 每秒 ${rps} 個請求，低於 NEEDS.md 換算出的尖峰：現在的尖峰 × 3`)
    assert.ok(sec(s.duration) >= 30, `${name} 只跑 ${s.duration}：至少 30 秒，太短看不出連線池、GC 的問題`)
  }
  assert.ok(!o.insecureSkipTLSVerify, 'insecureSkipTLSVerify 關掉了憑證驗證：使用者的瀏覽器會驗證，壓測也要驗證（測試用 SSL_CERT_FILE 提供 certs/ca.crt）')
  const t = o.thresholds ?? {}
  assert.ok(norm(t.http_req_duration).includes('p(95)<300'), "要有門檻 http_req_duration: ['p(95)<300']（NEEDS.md 的延遲 SLO）")
  assert.ok(norm(t.http_req_failed).includes('rate<0.001'), "要有門檻 http_req_failed: ['rate<0.001']：只看延遲時，錯誤回得很快的版本反而會過關")
  assert.ok(norm(t.dropped_iterations).includes('count==0'), "要有門檻 dropped_iterations: ['count==0']：VU 不夠、請求沒送出去時，量到的數字不可信")
  return all.reduce((n, [, s]) => n + s.rate / sec(s.timeUnit ?? '1s') * sec(s.duration), 0)
}

test('gate.js：constant-arrival-rate、尖峰到達率、至少 30 秒、三個門檻', () => {
  checkOptions()
})

test('在類正式環境跑 gate.js：k6 以 0 結束，請求經過 nginx，組成跟 NEEDS.md 一樣', { timeout: 300_000 }, async () => {
  assert.equal(ready, '', ready)
  const expected = checkOptions()
  const nginx = dc(dir, 'ps', '-q', 'nginx').stdout
  const since = new Date().toISOString()
  docker('rm', '-f', 'ld-26-k6')
  // 在 compose 網路裡的另一個容器跑：用服務名稱 nginx 連，憑證用 SSL_CERT_FILE 指定的 CA 驗證
  const r = await runAsync('docker', ['run', '--rm', '--name', 'ld-26-k6', '--network', 'ld-26_default',
    '-v', `${join(dir, 'loadtest')}:/scripts:ro`, '-v', `${join(dir, 'certs', 'ca.crt')}:/ca.crt:ro`, '-e', 'SSL_CERT_FILE=/ca.crt',
    '-w', '/scripts', K6, 'run', '--quiet', 'gate.js'], { timeout: 240_000 })
  const summary = (r.stdout + '\n' + r.stderr).split('\n').filter(l => /http_req_duration|http_req_failed|http_reqs|dropped_iterations|level=error|Insufficient VUs/.test(l)).join('\n')
  // nginx 的 access log：k6 送的請求（User-Agent 是 Grafana k6/…）
  const lines = run('docker', ['logs', '--since', since, nginx]).stdout.split('\n').filter(l => /k6\//.test(l))
  const count = (re: RegExp) => lines.filter(l => re.test(l)).length
  // k6 實際送出的請求數（摘要的 http_reqs）；讀不到時用設定算出來的數量
  const sent = Number(/http_reqs\D*?(\d+)/.exec(r.stdout + '\n' + r.stderr)?.[1] ?? expected)
  assert.ok(sent > 0 && lines.length >= sent * 0.9, `k6 送了 ${sent} 個請求，nginx 只看到 ${lines.length} 個：BASE 要是 https://nginx，跟使用者走同一條路（TLS、限流、反向代理），不能直接打 api`)
  const products = count(/"GET \/products /), cart = count(/"POST \/cart\/items /), orders = count(/"POST \/orders /)
  assert.ok(products >= lines.length * 0.6 && cart >= lines.length * 0.04 && orders >= lines.length * 0.04,
    `請求組成是 GET /products ${products}、POST /cart/items ${cart}、POST /orders ${orders}（共 ${lines.length}）：要照 NEEDS.md 的 8:1:1。只打健康檢查或單一路徑，驗收不到真正會慢的地方（寫入、Redis）`)
  // 狀態碼以 nginx 記下來的為準：用 setResponseCallback 把 4xx、5xx 算成成功，k6 的 http_req_failed 會好看，但使用者還是收到錯誤
  const errors = lines.filter(l => /" [45]\d\d /.test(l))
  assert.ok(errors.length <= lines.length * 0.001, `nginx 記到 ${errors.length} 個 4xx／5xx（共 ${lines.length} 個）：\n${errors.slice(0, 3).join('\n')}\n請求內容要是 API 接受的格式；錯誤要算進 http_req_failed，不能用 setResponseCallback 藏起來`)
  assert.equal(r.code, 0, `k6 以 ${r.code} 結束（99 = 門檻沒過）：\n${summary}\npreAllocatedVUs 要夠（到達率 × 最慢可接受的秒數，再留餘裕）；有門檻沒過就回頭看副本數與連線池（第 13 課）`)
})
