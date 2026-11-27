// 練習 3：把 fast.yml 拆成平行的 job。用 actionlint 與 YAML 檢查 job 圖、matrix 與快取
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { requireDocker } from '../../helpers/docker.ts'
import { actionlint, checkCache, checkNoBypass, checkNpm, checkPinned, healthOptions, jobsOf, loadWorkflow, needsOf, runsOf, usesStep } from './workflow.ts'

const dir = import.meta.dirname
let wf: any
let loadError: Error | undefined

before(() => {
  requireDocker()
  try { wf = loadWorkflow(dir, 'fast.yml') } catch (e) { loadError = e as Error }
})
const need = () => { if (loadError) throw loadError; return wf }
const CHECKS = ['typecheck', 'unit', 'integration']
const job = (id: string) => {
  const j = need().jobs[id]
  assert.ok(j, `找不到 job ${id}：要有 typecheck、unit、integration、image 四個 job`)
  return j
}

test('actionlint 沒有找到任何問題', () => {
  need()
  const r = actionlint(dir, 'fast.yml')
  assert.equal(r.code, 0, `actionlint 結束碼 ${r.code}：\n${r.out}`)
})

test('typecheck、unit、integration 三個 job 平行跑，各自只做自己的事', () => {
  for (const id of CHECKS) assert.deepEqual(needsOf(job(id)), [], `${id} 有 needs: ${JSON.stringify(job(id).needs)}：三個檢查互不依賴，同時開跑，整體時間是最慢的那一個，而不是加總`)
  const runs = (id: string) => runsOf(job(id)).join('\n')
  assert.match(runs('typecheck'), /npm run typecheck/, 'typecheck job 要跑 npm run typecheck')
  assert.match(runs('unit'), /npm (run )?test(?!:)/, 'unit job 要跑 npm test')
  const m = runs('integration').indexOf('npm run migrate'), t = runs('integration').indexOf('npm run test:integration')
  assert.ok(m >= 0 && t > m, 'integration job 要先 npm run migrate 再 npm run test:integration')
  assert.doesNotMatch(runs('typecheck') + runs('unit'), /test:integration|migrate/, '整合測試只放在 integration job')
  assert.doesNotMatch(runs('unit') + runs('integration'), /npm run (typecheck|ci)\b/, '型別檢查只放在 typecheck job：放進 unit 會跟著 matrix 多跑一份，放進 integration 會重複')
  const svc = Object.values(job('integration').services ?? {})[0]
  assert.ok(svc && healthOptions(svc).includes('--health-cmd'), 'integration job 要有含 --health-cmd 的 postgres service')
  for (const id of ['typecheck', 'unit']) assert.ok(!job(id).services, `${id} 不需要資料庫，不要啟動 postgres service`)
})

test('只有 unit 用 matrix，跑 Node 24 與 26', () => {
  for (const [id, j] of jobsOf(need())) if (id !== 'unit')
    assert.ok(!j.strategy?.matrix, `${id} 也用了 matrix：型別檢查、整合測試、建置的結果跟 Node 小版本無關，多跑一份只是多花時間`)
  const matrix = job('unit').strategy?.matrix
  assert.ok(matrix, 'unit 要用 strategy.matrix 跑兩個 Node 版本')
  const keys = Object.keys(matrix)
  assert.equal(keys.length, 1, `unit 的 matrix 只要一個維度（例如 node: [24, 26]），現在是 ${keys.join('、')}`)
  assert.deepEqual([matrix[keys[0]]].flat().map(String).sort(), ['24', '26'], `unit 的 matrix 是 ${JSON.stringify(matrix[keys[0]])}：要 [24, 26]`)
  const v = String(usesStep(job('unit'), 'actions/setup-node')?.with?.['node-version'] ?? '')
  assert.match(v, new RegExp(`matrix\\.${keys[0]}\\b`), `unit 的 setup-node 的 node-version 是 ${v || '（沒寫）'}：要用 \${{ matrix.${keys[0]} }}，不然兩份都跑同一個版本`)
})

test('image 等三個檢查都過才建置', () => {
  assert.deepEqual(needsOf(job('image')).sort(), [...CHECKS].sort(), `image 的 needs 是 ${JSON.stringify(job('image').needs) ?? '（沒寫）'}：要 needs: [typecheck, unit, integration]，否則檢查沒過也會建置映像`)
  assert.ok(runsOf(job('image')).some(r => /\bdocker (buildx )?build\b/.test(r)), 'image job 要 docker build')
})

test('每個用 setup-node 的 job 都有 cache: npm，不快取 node_modules', () => {
  checkCache(need())
  for (const id of CHECKS) assert.ok(usesStep(job(id), 'actions/setup-node'), `${id} 要用 actions/setup-node`)
})

test('uses 仍然釘 SHA；每個 job 先 npm ci；腳本都存在；失敗不能被蓋掉', () => {
  checkPinned(need())
  checkNpm(wf, dir)
  checkNoBypass(wf)
})
