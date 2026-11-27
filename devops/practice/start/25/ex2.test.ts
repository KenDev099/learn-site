// 練習 2：事故演練。測試重新執行 drill.sh（部署有問題的 2.4.0），記下當時的 log 與 /metrics，
// 執行你的 mitigate.sh，再量錯誤率、檢查止血的方式對不對，最後核對 incident.json
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docker, inspect, readJson, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const URL = 'http://localhost:18250'
const BASE = 'node:24.22.2-alpine3.24'
let logs: any[] = []
let metricsText = ''
let badImage = ''

// 本課的容器都叫 ld-25-*：包含你可能自己多開的副本
function cleanup() {
  const ids = docker('ps', '-aq', '--filter', 'name=^ld-25-').stdout.split('\n').filter(Boolean)
  if (ids.length) docker('rm', '-f', '-v', ...ids)
}

before(async () => {
  requireDocker()
  cleanup()
  if (docker('image', 'inspect', BASE).code !== 0) {
    const r = run('docker', ['pull', BASE], { timeout: 300_000 })
    if (r.code !== 0) throw new Error(`下載 ${BASE} 失敗：${r.stderr.split('\n').at(-1)}`)
  }
  const drill = run('sh', ['drill.sh'], { cwd: dir, timeout: 600_000 })
  if (drill.code !== 0) throw new Error(`sh drill.sh 失敗（drill.sh、deploy.sh、drill/ 不用改；改壞了就從 start/25 複製回來）：\n${drill.stderr || drill.stdout}`.slice(0, 1500))
  badImage = inspect('learn-devops/cafe-api:25-2.4.0', 'image').Id
  const l = docker('logs', 'ld-25-api')
  logs = (l.stdout + '\n' + l.stderr).split('\n').flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  metricsText = await (await fetch(`${URL}/metrics`)).text()
  const m = run('sh', ['mitigate.sh'], { cwd: dir, timeout: 180_000 })
  if (m.code !== 0) throw new Error(`sh mitigate.sh 失敗（結束碼 ${m.code}）：${m.stderr || m.stdout}`.slice(0, 1200))
  await new Promise(r => setTimeout(r, 1000))   // 讓 SIGHUP 或重新啟動生效
  await waitHttp(`${URL}/health`, 20_000)
}, { timeout: 900_000 })
after(cleanup)

test('止血後：200 個請求的錯誤率低於 0.1%、p95 低於 300ms', async () => {
  const times: number[] = []
  let failed = 0
  for (let i = 0; i < 200; i++) {
    const t = performance.now()
    const order = i % 4 === 0
    const res = await fetch(`${URL}${order ? '/orders' : '/products'}`, order
      ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': `check-${i}` }, body: JSON.stringify({ product_id: 1 + i % 6, quantity: 1 + i % 3 }) }
      : { headers: { 'x-request-id': `check-${i}` } })
    await res.arrayBuffer()
    times.push(performance.now() - t)
    if (res.status >= 500) failed++
  }
  times.sort((a, b) => a - b)
  assert.equal(failed, 0, `止血後還有 ${failed} 個 5xx（${failed / 2}%）：問題還在。只重啟、只多開副本都不會讓壞掉的程式路徑消失；先從 log 找出是哪一種問題`)
  assert.ok(times[189] < 300, `p95 是 ${Math.round(times[189])}ms，要低於 300ms`)
})

test('安全修正還在：跑的仍是 2.4.0、由 deploy.sh 建立，負數的 quantity 會被拒絕', async () => {
  const c = inspect('ld-25-api')
  assert.ok(c, '找不到 ld-25-api 容器：止血後服務要還在跑')
  assert.equal(c.Config.Labels?.['learn.deployed-by'], 'deploy.sh', 'ld-25-api 不是 deploy.sh 建立的：要換版本就用 deploy.sh，不要自己 docker run')
  assert.equal(c.Image, badImage, `ld-25-api 跑的不是 2.4.0（${c.Config.Labels?.['org.opencontainers.image.version']}）。這次的問題只在新結帳流程，回滾整個版本會把 2.4.0 的安全修正（拒絕負數 quantity）一起退掉`)
  const res = await fetch(`${URL}/orders`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: 1, quantity: -3 }) })
  assert.equal(res.status, 400, `quantity: -3 的訂單回 ${res.status}，應該是 400：安全修正不見了`)
})

test('只關掉出問題的旗標，其他旗標不動', () => {
  let flags: any
  try { flags = JSON.parse(readFileSync(join(dir, 'state', 'flags.json'), 'utf8')) } catch (e) { assert.fail(`state/flags.json 讀不到或不是合法的 JSON：${(e as Error).message}`) }
  assert.equal(flags.new_checkout, false, 'state/flags.json 的 new_checkout 要改成 false')
  assert.equal(flags.loyalty, true, 'state/flags.json 的 loyalty 被改掉了：止血只動出問題的那個旗標')
})

test('沒有進容器手動改檔案（docker diff 是空的）', () => {
  const d = docker('diff', 'ld-25-api')
  assert.equal(d.code, 0, `docker diff 失敗：${d.stderr}`)
  assert.equal(d.stdout, '', `容器裡的檔案被改過：\n${d.stdout}\n進容器改的東西沒有紀錄、下次部署就消失，也沒有經過 review。改設定（state/flags.json）或用 deploy.sh 換版本`)
})

test('incident.json：問題類型、壞版本、時間、止血動作', () => {
  const inc = readJson(dir, 'incident.json')
  assert.equal(inc.problem_type, 'flag', 'problem_type 要是 "code"（程式本身壞了）或 "flag"（某個功能旗標打開的程式路徑壞了）其中一個，而且要選對')
  assert.equal(inc.bad_version, '2.4.0', 'bad_version 寫出事的版本號：看 state/deploy.log 或 /metrics 的 cafe_build_info')
  assert.equal(inc.mitigation, 'flag-off', 'mitigation 要是 "rollback" 或 "flag-off"，並且跟你在 mitigate.sh 做的一致')
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
  for (const k of ['detected_at', 'mitigated_at'])
    assert.match(String(inc[k] ?? ''), ISO, `${k} 要是 UTC 的 ISO 時間，例如 2026-11-01T01:29:47Z（結尾的 Z 代表 UTC）`)
  assert.ok(Date.parse(inc.mitigated_at) > Date.parse(inc.detected_at), 'mitigated_at 要晚於 detected_at')
})

test('incident.json 的 3 筆證據都查得到：log 的 request_id 是 5xx、指標的數值跟 /metrics 一樣', () => {
  const ev = readJson(dir, 'incident.json').evidence
  assert.ok(Array.isArray(ev) && ev.length >= 3, 'evidence 至少要 3 筆，例如 {"kind":"log","request_id":"…"} 或 {"kind":"metric","name":"…","value":…}')
  assert.ok(ev.some((e: any) => e.kind === 'log') && ev.some((e: any) => e.kind === 'metric'), 'evidence 裡 log 與 metric 各至少一筆')
  for (const e of ev) {
    if (e.kind === 'log') {
      const line = logs.find(l => l.request_id === e.request_id && l.msg === 'request')
      assert.ok(line, `log 裡找不到 request_id ${JSON.stringify(e.request_id)}：從 docker logs ld-25-api 複製，不要自己編`)
      assert.ok(line.status >= 500, `${e.request_id} 的 status 是 ${line.status}，不是錯誤：證據要挑出事的請求`)
    } else if (e.kind === 'metric') {
      const sample = metricsText.split('\n').find(l => !l.startsWith('#') && l.slice(0, l.lastIndexOf(' ')) === e.name)
      assert.ok(sample, `/metrics 裡沒有 ${JSON.stringify(e.name)}：name 寫完整的序列，例如 http_requests_total{route="/products",status="200"}`)
      assert.equal(Number(sample.slice(sample.lastIndexOf(' ') + 1)), Number(e.value), `${e.name} 當時的值是 ${sample.slice(sample.lastIndexOf(' ') + 1)}，不是 ${e.value}`)
    } else assert.fail(`evidence 的 kind 只能是 "log" 或 "metric"：${JSON.stringify(e)}`)
  }
})
