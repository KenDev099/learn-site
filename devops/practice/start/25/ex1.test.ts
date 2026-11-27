// 練習 1：燃燒率告警該響時響、不該響時安靜、恢復後很快解除
// 用 prom/prometheus:v3.15.1 裡的 promtool test rules：餵假的請求數，在指定時間點查 ALERTS（Prometheus 替每個 pending／firing 的告警產生的序列）
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { docker, requireDocker, run } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'prom/prometheus:v3.15.1'
const tmp = mkdtempSync(join(tmpdir(), 'ld-25-alerts-'))
const NAMES = ['CafeApiErrorBudgetBurnFast', 'CafeApiErrorBudgetBurnSlow', 'CafeApiErrorBudgetBurnTicket']
const SEVERITY: Record<string, string> = { CafeApiErrorBudgetBurnFast: 'page', CafeApiErrorBudgetBurnSlow: 'page', CafeApiErrorBudgetBurnTicket: 'ticket' }

before(() => {
  requireDocker()
  if (docker('image', 'inspect', IMAGE).code !== 0) {
    const r = run('docker', ['pull', IMAGE], { timeout: 300_000 })
    if (r.code !== 0) throw new Error(`下載 ${IMAGE} 失敗：${r.stderr.split('\n').at(-1)}`)
  }
})
after(() => rmSync(tmp, { recursive: true, force: true }))

// 每分鐘 10,000 個請求；segments 是 [持續幾分鐘, 錯誤比例]，產生兩條 counter（200 與 500）
function series(segments: [number, number][]) {
  const ok = [0], bad = [0]
  for (const [minutes, ratio] of segments) for (let i = 0; i < minutes; i++) {
    bad.push(bad.at(-1)! + 10_000 * ratio)
    ok.push(ok.at(-1)! + 10_000 * (1 - ratio))
  }
  return [
    { series: 'http_requests_total{job="cafe-api",status="200"}', values: ok.join(' ') },
    { series: 'http_requests_total{job="cafe-api",status="500"}', values: bad.join(' ') },
  ]
}

type Check = [minute: number, firing: string[], silent: string[]]
const CASES: { name: string, why: string, segments: [number, number][], checks: Check[] }[] = [
  { name: '平常（錯誤 0.05%）', why: '錯誤比例在 SLO 之內，三個告警都不能響。門檻是「燃燒率 × 0.001」（SLO 寫成 0.999，不是 99.9）',
    segments: [[480, 0.0005]], checks: [[30, [], NAMES], [120, [], NAMES], [420, [], NAMES]] },
  { name: '大事故（錯誤 2% 持續 1 小時後恢復）', why: '燃燒率 20：Fast 要在開始後 50 分鐘內響（不要用 for: 1h 代替長視窗）；恢復後 10 分鐘要解除（要同時看 5m 短視窗）',
    segments: [[120, 0.0005], [60, 0.02], [60, 0.0005]], checks: [[170, ['CafeApiErrorBudgetBurnFast'], []], [190, [], ['CafeApiErrorBudgetBurnFast']]] },
  { name: '短暫尖峰（錯誤 2% 只持續 4 分鐘）', why: '4 分鐘的尖峰燒掉的預算很少，三個告警都不能響（只看 5m 短視窗會被尖峰吵醒）',
    segments: [[400, 0.0005], [4, 0.02], [76, 0.0005]], checks: [[405, [], NAMES], [410, [], NAMES], [430, [], NAMES], [460, [], NAMES]] },
  { name: '慢性問題（錯誤 0.7% 持續 6.5 小時後恢復）', why: '燃燒率 7：Slow（6 倍，6h 與 30m）要在 5.5 小時內響，Fast（14.4 倍）不能響；恢復後 40 分鐘 Slow 要解除（要同時看 30m 短視窗）',
    segments: [[60, 0.0005], [390, 0.007], [60, 0.0005]], checks: [[390, ['CafeApiErrorBudgetBurnSlow'], ['CafeApiErrorBudgetBurnFast']], [490, [], ['CafeApiErrorBudgetBurnSlow']]] },
  { name: '小毛病（錯誤 0.15% 持續 8 小時）', why: '燃燒率 1.5：只開 Ticket（1 倍，3d 與 6h），兩個 page 都不能響',
    segments: [[480, 0.0015]], checks: [[420, ['CafeApiErrorBudgetBurnTicket'], ['CafeApiErrorBudgetBurnFast', 'CafeApiErrorBudgetBurnSlow']]] },
]

// 每個時間點、每個告警名稱各一個 promql_expr_test：firing 的序列數（沒有就是 0）。
// 結果加上 case label，從 promtool 的輸出就知道是哪個情境沒過
let result: { code: number | null, out: string } | null = null
function promtoolTest() {
  if (result) return result
  writeFileSync(join(tmp, 'test.yml'), JSON.stringify({
    rule_files: ['/w/slo-rules.yml', '/w/alerts.yml'], evaluation_interval: '1m',
    tests: CASES.map((c, i) => ({
      name: c.name, interval: '1m', input_series: series(c.segments),
      promql_expr_test: c.checks.flatMap(([m, firing, silent]) => [...firing.map(a => [a, 1] as const), ...silent.map(a => [a, 0] as const)].map(([a, n]) => ({
        expr: `label_replace(count(ALERTS{alertname="${a}",alertstate="firing"}) or vector(0), "case", "${i}", "", "")`,
        eval_time: `${m}m`,
        exp_samples: [{ labels: `{case="${i}"}`, value: n }],
      }))),
    })),
  }))
  const r = docker('run', '--rm', '--entrypoint', '/bin/promtool', '-v', `${dir}:/w:ro`, '-v', `${tmp}:/t:ro`, IMAGE, 'test', 'rules', '/t/test.yml')
  return result = { code: r.code, out: (r.stdout + '\n' + r.stderr).trim() }
}

function rules(): any[] {
  let doc: any
  try { doc = parse(readFileSync(join(dir, 'alerts.yml'), 'utf8')) } catch (e) { throw new Error(`alerts.yml 讀不到或不是合法的 YAML：${(e as Error).message}`) }
  return (doc?.groups ?? []).flatMap((g: any) => g.rules ?? []).filter((r: any) => r.alert)
}

test('alerts.yml 能被 Prometheus 載入，而且三個告警都在', () => {
  const r = promtoolTest()
  assert.ok(r.code === 0 || /expr: "label_replace\(count\(ALERTS/.test(r.out), `promtool 載入規則失敗（YAML 格式或 PromQL 語法錯誤）：\n${r.out.slice(0, 1200)}`)
  const names = rules().map(r => r.alert)
  for (const n of NAMES) assert.ok(names.includes(n), `alerts.yml 裡找不到 alert: ${n}`)
})

test('每個告警都有對的 severity、summary 與 runbook_url', () => {
  for (const r of rules().filter(r => NAMES.includes(r.alert))) {
    assert.equal(r.labels?.severity, SEVERITY[r.alert], `${r.alert} 的 labels.severity 要是 ${SEVERITY[r.alert]}：page 會叫醒值班者，ticket 等上班時間處理`)
    assert.ok(typeof r.annotations?.summary === 'string' && r.annotations.summary.trim().length >= 5, `${r.alert} 要有 annotations.summary：收到通知的人第一眼看到的說明`)
    assert.match(String(r.annotations?.runbook_url ?? ''), /^https?:\/\/\S+$/, `${r.alert} 要有 annotations.runbook_url（http 或 https 網址）：半夜被叫醒的人要知道下一步做什麼`)
  }
})

const minutes = (t: string) => { const m = /(?:(\d+)h)?(?:(\d+)m)?/.exec(t)!; return +(m[1] ?? 0) * 60 + +(m[2] ?? 0) }

CASES.forEach((c, i) => test(`${c.name}：該響的響、不該響的安靜`, () => {
  const fails = promtoolTest().out.split(/\n(?=\s*expr: )/).filter(b => b.includes(`\\"case\\", \\"${i}\\"`)).map(b => {
    const m = /alertname=\\"(\w+)\\"[\s\S]*?time: ([\dhm]+)/.exec(b)
    return m ? `第 ${minutes(m[2])} 分鐘：${m[1]} ${/exp: \{[^}]*\} 1E\+00/.test(b) ? '應該在響，但沒有' : '不應該響，但在響'}` : b.trim()
  })
  assert.equal(fails.length, 0, `${c.why}。\n${fails.join('\n')}`)
}))
