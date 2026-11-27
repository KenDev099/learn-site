// 練習 1：.github/workflows/ci.yml。結構用 YAML 檢查，再把 job 裡的 run 指令拿到 Linux 容器裡真的跑一次
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { docker, inspect, removeContainers, requireDocker, run } from '../../helpers/docker.ts'
import { actionlint, checkCache, checkNoBypass, checkNpm, checkPinned, healthOptions, jobsOf, loadWorkflow, needsOf, pushes, runsOf, stepsOf, triggers, usesStep } from './workflow.ts'

const dir = import.meta.dirname
const NODE = 'node:24.22.2-alpine3.24'
const PG = 'ld-15-pg'
let wf: any
let loadError: Error | undefined

before(() => {
  requireDocker()
  removeContainers(PG)
  try { wf = loadWorkflow(dir, 'ci.yml') } catch (e) { loadError = e as Error }
})
after(() => removeContainers(PG))

const need = () => { if (loadError) throw loadError; return wf }
const job = (id: string) => {
  const j = need().jobs[id]
  assert.ok(j, `找不到 job ${id}：jobs 底下要有 check、integration、image 三個 job`)
  return j
}
const tail = (s: string) => s.split('\n').slice(-25).join('\n')

// 結構檢查（很快）沒過時，後面實際執行 job 的兩項（要幾分鐘）直接判錯，先把結構修好
const failed: string[] = []
const check = (name: string, fn: () => void) => test(name, () => {
  try { fn() } catch (e) { failed.push(name); throw e }
})
const structureOk = () => assert.ok(!failed.length, `上面「${failed.join('」「')}」沒過：先修好，這一項才會實際執行 job`)

// 在 node 容器裡依序執行一個 job 的 run 指令（uses 的步驟在這裡不需要：程式碼已經掛進去了，node 也已經裝好）
function runJob(id: string, extra: string[] = []) {
  const j = job(id)
  assert.ok(usesStep(j, 'actions/checkout'), `job ${id} 沒有 actions/checkout：runner 是一台全新的機器，不先 checkout 就沒有程式碼`)
  const env = { ...need().env, ...j.env }
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  const script = ['set -e', 'cp -r /src /app', 'cd /app', ...stepsOf(j).filter(s => s.run).map(s =>
    Object.entries(s.env ?? {}).map(([k, v]) => `export ${k}='${String(v).replaceAll("'", `'\\''`)}'\n`).join('') + s.run)].join('\n')
  return run('docker', ['run', '--rm', ...extra, '-v', `${dir}:/src:ro`, '-v', 'ld-15-npm:/root/.npm', ...envArgs, NODE, 'sh', '-c', script], { timeout: 600_000 })
}

check('actionlint 沒有找到任何問題', () => {
  need()
  const r = actionlint(dir, 'ci.yml')
  assert.equal(r.code, 0, `actionlint 結束碼 ${r.code}：\n${r.out}`)
})

check('pull_request 與 push 到 main 時觸發，不用 pull_request_target', () => {
  const on = triggers(need())
  assert.ok(!('pull_request_target' in on), 'ci.yml 用了 pull_request_target：它用的是 base 分支的權限與機密，跑 PR 的程式碼等於把 repo 交給陌生人。檢查 PR 用 pull_request')
  assert.ok('pull_request' in on, '沒有 pull_request 觸發：每個 PR 都要檢查')
  const branches = [on.push?.branches ?? []].flat()
  assert.ok('push' in on && branches.includes('main'), '要在 push 到 main 時也觸發（on.push.branches: [main]）：合併後的 main 也要確認是綠的')
})

check('workflow 層級的 permissions 只有 contents: read', () => {
  const p = need().permissions
  assert.ok(p !== undefined, '沒有寫 permissions：GITHUB_TOKEN 會用 repo 的預設權限（舊 repo 可能是全部可寫）。在最上層寫 permissions: contents: read')
  assert.deepEqual(p, { contents: 'read' }, `permissions 是 ${JSON.stringify(p)}：這個 workflow 只需要讀程式碼，寫 permissions: { contents: read }`)
  for (const [id, j] of jobsOf(wf)) assert.ok(j.permissions === undefined, `job ${id} 自己又設了 permissions：這個 workflow 不需要更多權限`)
})

check('concurrency：以 ref 分組，只有 PR 會取消前一次', () => {
  const c = need().concurrency
  assert.ok(c && typeof c === 'object', '沒有 concurrency：同一個 PR 連推三次會同時跑三份')
  assert.match(String(c.group), /github\.(ref|head_ref)\b/, `concurrency.group 是 ${c.group}：要包含 github.ref，同一個分支或 PR 才會在同一組`)
  const cancel = String(c['cancel-in-progress']).replace(/\s+/g, ' ')
  assert.match(cancel, /github\.event_name ?== ?['"]pull_request['"]/, `cancel-in-progress 是 ${cancel}：PR 推新 commit 時舊的可以取消，main 上的每一次都要跑完。寫 \${{ github.event_name == 'pull_request' }}`)
})

check('三個 job：integration 等 check，image 等前兩者；每個 job 都有 timeout-minutes ≤ 15', () => {
  job('check'); job('integration'); job('image')
  assert.deepEqual(needsOf(wf.jobs.check), [], 'check 是第一關，不用 needs')
  assert.deepEqual(needsOf(wf.jobs.integration), ['check'], `integration 的 needs 是 ${JSON.stringify(wf.jobs.integration.needs)}：要 needs: check，型別或單元測試沒過就不必啟動資料庫`)
  assert.deepEqual(needsOf(wf.jobs.image).sort(), ['check', 'integration'], `image 的 needs 是 ${JSON.stringify(wf.jobs.image.needs)}：要 needs: [check, integration]，檢查都過了才建置映像`)
  for (const [id, j] of jobsOf(wf)) {
    const t = j['timeout-minutes']
    assert.ok(typeof t === 'number' && t > 0 && t <= 15, `job ${id} 的 timeout-minutes 是 ${t ?? '（沒寫）'}：預設 360 分鐘，卡住的 job 會一直占著 runner、燒額度。寫 15 以內`)
  }
})

check('每個 uses 都釘到 commit SHA；setup-node 開 npm 快取', () => {
  checkPinned(need())
  checkCache(wf)
  for (const id of ['check', 'integration']) assert.ok(usesStep(job(id), 'actions/setup-node'), `job ${id} 沒有用 actions/setup-node 指定 Node 版本`)
})

check('用 npm ci；npm run 的腳本都存在；失敗不能被蓋掉', () => {
  checkNpm(need(), dir)
  checkNoBypass(wf)
  assert.ok(runsOf(job('check')).some(r => /\bnpm ci\b/.test(r)), 'check 要先 npm ci 安裝套件')
  const image = job('image')
  const builds = runsOf(image).some(r => /\bdocker (buildx )?build\b/.test(r)) || stepsOf(image).some(s => s.uses?.startsWith('docker/build-push-action@') && s.with?.push !== true)
  assert.ok(builds, 'image 要建置映像（run: docker build …）')
  assert.ok(usesStep(image, 'actions/checkout'), 'image 沒有 actions/checkout：每個 job 都在全新的機器上，沒有程式碼就沒有 Dockerfile 可以建置')
  assert.ok(!pushes(image), 'image 這一課只 build 不 push：推到 registry 是第 16 課 CD 的事，PR 的程式碼不該推出去')
})

test('check 的指令在 Linux 的 Node 24 容器裡跑得過（npm ci → typecheck → 單元測試）', () => {
  structureOk()
  const runs = runsOf(job('check')).join('\n')
  assert.match(runs, /npm run typecheck/, 'check 要跑 npm run typecheck')
  assert.match(runs, /npm (run )?test(?!:)/, 'check 要跑單元測試 npm test')
  const r = runJob('check')
  assert.equal(r.code, 0, `check 的指令在 ${NODE} 裡失敗：\n${tail(r.stdout + '\n' + r.stderr)}`)
})

test('integration：postgres service 有健康檢查，用 localhost 連線，先 migrate 再跑整合測試', () => {
  structureOk()
  const j = job('integration')
  const [name, svc] = Object.entries(j.services ?? {})[0] ?? []
  assert.ok(svc?.image, 'integration 要有 services，用 postgres:18.6-alpine3.24 啟動資料庫')
  assert.match(String(svc.image), /^postgres:/, `service 的映像是 ${svc.image}，要用 postgres`)
  const opts = healthOptions(svc)
  assert.ok(opts.includes('--health-cmd'), `service ${name} 的 options 沒有 --health-cmd：沒有健康檢查，runner 啟動容器後就開始跑 steps，資料庫還沒準備好，migrate 會偶爾連不上`)
  const url = String(j.env?.DATABASE_URL ?? stepsOf(j).find(s => s.env?.DATABASE_URL)?.env?.DATABASE_URL ?? '')
  assert.ok(url, 'integration 要設定 DATABASE_URL（job 的 env）')
  let u: URL
  try { u = new URL(url) } catch { assert.fail(`DATABASE_URL 不是合法的網址：${url}`) }
  assert.ok(['localhost', '127.0.0.1'].includes(u.hostname), `DATABASE_URL 的主機是 ${u.hostname}：job 直接跑在 runner 上（沒有 container:），service 只能用 localhost 加上對應出來的 port 連；用服務名稱要整個 job 跑在容器裡`)
  const port = u.port || '5432'
  const ports = [svc.ports ?? []].flat().map(String)
  assert.ok(ports.some(p => p === `${port}:5432`), `service 的 ports 是 ${JSON.stringify(svc.ports)}：DATABASE_URL 用 localhost:${port}，要把容器的 5432 對應出來（ports: ["${port}:5432"]）`)
  const runs = runsOf(j).join('\n')
  const m = runs.indexOf('npm run migrate'), t = runs.indexOf('npm run test:integration')
  assert.ok(m >= 0 && t > m, 'integration 要先 npm run migrate，再 npm run test:integration：測試資料庫是空的，要先建表')

  // 照 runner 的做法啟動 service：同樣的映像、環境變數與 options，等到 healthy
  const envArgs = Object.entries(svc.env ?? {}).flatMap(([k, v]) => ['-e', `${k}=${v}`])
  const started = docker('run', '-d', '--name', PG, ...opts, ...envArgs, String(svc.image))
  assert.equal(started.code, 0, `用 service 的設定啟動不了容器：${started.stderr}`)
  const end = Date.now() + 90_000
  let status = ''
  while (Date.now() < end) {
    status = inspect(PG)?.State?.Health?.Status ?? 'none'
    if (status === 'healthy' || status === 'none' || status === 'unhealthy') break
    run('sleep', ['1'])
  }
  assert.equal(status, 'healthy', `postgres service 90 秒內沒有變成 healthy（${status}）：${docker('logs', '--tail', '10', PG).stderr}`)
  // 跟 runner 一樣：job 的程序在 localhost 看得到 service 對應出來的 port
  const r = runJob('integration', ['--network', `container:${PG}`])
  assert.equal(r.code, 0, `integration 的指令失敗：\n${tail(r.stdout + '\n' + r.stderr)}`)
})
