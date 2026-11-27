// 練習 2：deploy.sh <版本>：先跑 migrate-<版本> Job，Complete 才更新 cafe-api；Failed 立刻以非 0 結束，應用維持原版本
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeIn, kubeJson, nsName, probe, readText, requireCluster, runScript, waitFor } from '../../helpers/k8s.ts'
import { buildMigrateImages, columns, jobLogs, sql, startPostgres, trueConditions, waitJobDone } from './jobs.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(10, 2)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

const image = () => kubeJson('get', 'deployment', 'cafe-api', '-n', ns).spec.template.spec.containers[0].image
// 從叢集內打 Service 的 /version，回傳 version（Service 剛換 Pod 時重試幾次）
const apiVersion = () => waitFor(() => {
  const r = probe(`http://cafe-api.${ns}.svc.cluster.local/version`)
  return r.status === 200 ? JSON.parse(r.body).version as string : undefined
}, 60_000, 'cafe-api 的 /version 一直沒有回 200')

test('deploy.sh 寫了 kubectl 指令，migrate-job.yaml、app.yaml 沒被改', { timeout: 30_000 }, () => {
  const script = readText(dir, 'deploy.sh').split('\n').filter(l => !/^\s*#/.test(l)).join('\n')
  assert.match(script, /\bkubectl\b/, 'deploy.sh 還沒有任何 kubectl 指令：照著 TODO 寫')
  for (const f of ['migrate-job.yaml', 'app.yaml'])
    assert.equal(readText(dir, f), readFileSync(join(import.meta.dirname, '..', '..', 'start', '10', 'ex2', f), 'utf8').replace(/\r/g, ''), `${f} 不用改：要改的只有 deploy.sh`)
  staticOk = true
})

test('deploy.sh v2 先 migrate 再更新應用；deploy.sh v3-broken 的 migration 失敗時 150 秒內 exit 1、應用維持 v2', { timeout: 900_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  buildMigrateImages()
  freshNamespace(ns)
  await startPostgres(ns, ['db-migrator', 'db-app'])
  // 線上現況：v1 的 migration 跑過、cafe-api v1 在跑
  const v1 = kubeIn(readText(dir, 'migrate-job.yaml').replaceAll('__VERSION__', 'v1'), 'create', '-n', ns, '-f', '-')
  assert.equal(v1.code, 0, `測試建立 migrate-v1 失敗：${v1.stderr}`)
  assert(trueConditions(await waitJobDone(ns, 'migrate-v1', 180_000)).includes('Complete'), `測試準備的 migrate-v1 失敗：${jobLogs(ns, 'migrate-v1')}`)
  applyDir(join(dir, 'app.yaml'), ns)
  const ro = kube('rollout', 'status', 'deployment/cafe-api', '-n', ns, '--timeout=180s')
  assert.equal(ro.code, 0, `測試準備的 cafe-api v1 沒有 Ready：${ro.stderr || ro.stdout}`)

  // 1. 正常部署 v2
  const r2 = runScript(dir, 'deploy.sh', ['v2'], { timeout: 300_000 })
  assert.equal(r2.code, 0, `bash deploy.sh v2 應該以 0 結束，實際是 ${r2.code}：\n${r2.stderr || r2.stdout}`)
  const job2 = kubeJson('get', 'job', 'migrate-v2', '-n', ns)
  assert(trueConditions(job2).includes('Complete'), 'deploy.sh v2 要先建立 migrate-v2 並等它 Complete')
  assert.equal(job2.spec.template.spec.containers[0].image, 'learn-k8s/cafe-migrate:v2', 'migrate-v2 要用 cafe-migrate:v2（把範本裡的 __VERSION__ 都換掉）')
  assert(columns(ns).split(',').includes('note'), 'v2 的 migration 跑完後 orders 應該有 note 欄位')
  assert.equal(image(), 'learn-k8s/cafe-api:v2', 'deploy.sh v2 之後 deployment/cafe-api 的映像應該是 learn-k8s/cafe-api:v2')
  const dep = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  assert.equal(dep.status.updatedReplicas, 2, 'deploy.sh 結束前要等滾動更新完成（kubectl rollout status）')
  assert.equal(await apiVersion(), 'v2', 'deploy.sh v2 之後 API 的 /version 應該是 v2')

  // 2. migration 會失敗的版本：不能動到應用，而且要盡快結束
  const gen = dep.metadata.generation
  const t0 = Date.now()
  const r3 = runScript(dir, 'deploy.sh', ['v3-broken'], { timeout: 150_000 })
  const secs = Math.round((Date.now() - t0) / 1000)
  const after = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  assert.equal(after.spec.template.spec.containers[0].image, 'learn-k8s/cafe-api:v2',
    `migration 失敗時應用不能被更新，現在 cafe-api 的映像變成 ${after.spec.template.spec.containers[0].image}：要先等 migration 成功，再改 Deployment`)
  assert.equal(after.metadata.generation, gen, 'migration 失敗時不要動 deployment/cafe-api（generation 變了，代表它被改過）')
  assert.notEqual(r3.code, null, `bash deploy.sh v3-broken 超過 150 秒還沒結束：migration 早就 Failed 了，腳本卻還在等。等的時候要同時檢查 Complete 和 Failed`)
  assert.notEqual(r3.code, 0, 'migration 失敗時 deploy.sh 要以非 0 結束，CI 才知道部署失敗')
  assert(trueConditions(kubeJson('get', 'job', 'migrate-v3-broken', '-n', ns)).includes('Failed'), `deploy.sh v3-broken 應該建立 migrate-v3-broken 並等到它 Failed（花了 ${secs} 秒）`)
  assert.equal(sql(ns, "SELECT count(*) FROM schema_migrations WHERE name LIKE '003%'"), '0', '失敗的 migration 不應該留下紀錄')
  assert.equal(await apiVersion(), 'v2', 'migration 失敗後 API 應該還是 v2')
})
