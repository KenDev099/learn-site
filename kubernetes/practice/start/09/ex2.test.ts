// 練習 2：deploy.sh <tag>：成功就結束；壞版本在時限內失敗、自動 rollout undo、等回滾完成、exit 1；全程 0 錯誤
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeJson, kubectlVerb, nsName, requireCluster, runScriptAsync, spyKubectl, waitPodsReady } from '../../helpers/k8s.ts'
import { readDeployment, readyPods, resolveRolling, rolloutStatus, trafficDuring } from './lib.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(9, 2)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'
const URL = `http://cafe-api.${ns}.svc.cluster.local/version`
let staticOk = false, v2Ok = false, uid = ''

before(() => requireCluster())
after(() => deleteNamespace(ns))

async function deploy(tag: string) {
  const spy = spyKubectl()
  try {
    const t0 = Date.now()
    const r = await runScriptAsync(dir, 'deploy.sh', [tag], { env: spy.env, timeout: 300_000 })
    return { ...r, secs: Math.round((Date.now() - t0) / 1000), calls: spy.calls() }
  } finally { spy.cleanup() }
}
const verb = (a: string[]) => kubectlVerb(a).join(' ')
const isStatus = (a: string[]) => verb(a) === 'rollout status' && a.some(w => w.startsWith('--timeout'))
const template = () => kubeJson('get', 'deployment', 'cafe-api', '-n', ns)

test('deployment.yaml：progressDeadlineSeconds 60、maxUnavailable 0、有 readinessProbe', { timeout: 30_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert.equal(dep.spec.progressDeadlineSeconds, 60, 'spec.progressDeadlineSeconds 設 60：新版本 60 秒沒有進展就標成失敗（預設要等 600 秒）')
  assert.equal(resolveRolling(dep).unavailable, 0, 'maxUnavailable 維持 0（練習 1）：壞版本才不會關掉任何舊 Pod')
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready', 'readinessProbe 維持練習 1 的設定')
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', 'deployment.yaml 的映像維持 v1：換版本是 deploy.sh 的工作')
  staticOk = true
})

test('deploy.sh v2：rollout status 等到完成、以 0 結束、4 個 Pod 都是 v2、全程 0 錯誤', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  await rolloutStatus(ns)
  await waitPodsReady(ns, SELECTOR, 4, 120_000)
  uid = template().metadata.uid
  const { load, value: r } = await trafficDuring([URL], 10, () => deploy('v2'))
  assert.equal(r.code, 0, `deploy.sh v2 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  assert(r.calls.some(isStatus), '用 kubectl rollout status --timeout=… 等 rollout 完成，腳本才知道成功還是失敗')
  const images = readyPods(ns, SELECTOR).map((p: any) => p.spec.containers[0].image)
  assert.deepEqual(images, Array(4).fill('learn-k8s/cafe-api:v2'), `deploy.sh 結束時應該已經有 4 個 Ready 的 v2 Pod（現在是 ${images.join('、') || '沒有'}）`)
  assert.equal(load.errors, 0, `部署期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
  v2Ok = true
})

test('deploy.sh bad：180 秒內以 1 結束、自動 undo 並等回滾完成、留下 4 個 v2 Pod、全程 0 錯誤', { timeout: 420_000 }, async () => {
  assert(v2Ok, '先讓上一項（deploy.sh v2）通過')
  const { load, value: r } = await trafficDuring([URL], 10, () => deploy('bad'))
  const calls = r.calls
  const recreated = calls.filter(a => ['delete', 'create', 'replace'].includes(kubectlVerb(a)[0]))
  assert.deepEqual(recreated.map(a => a.join(' ')), [], '不要刪掉重建 Deployment：會丟掉 rollout history，而且所有 Pod 同時被換掉、服務中斷。用 kubectl rollout undo')
  const dep = template()
  assert.equal(dep.metadata.uid, uid, 'Deployment 被刪掉重建了：用 kubectl rollout undo 回到上一個 revision')
  assert.notEqual(r.code, null, `deploy.sh bad 跑了 ${r.secs} 秒還沒結束：rollout status 要加 --timeout`)
  assert.notEqual(r.code, 0, '部署失敗時 deploy.sh 一定要以非 0 結束（例如 exit 1），CI 才會亮紅燈；回滾成功不代表這次部署成功')
  assert(r.secs <= 180, `deploy.sh bad 花了 ${r.secs} 秒：progressDeadlineSeconds 60 加上 rollout status 的 --timeout（120 秒內），整段要在 180 秒內結束`)
  const undo = calls.findLastIndex(a => verb(a) === 'rollout undo')
  assert(undo >= 0, '失敗時要執行 kubectl rollout undo：Kubernetes 不會自動回滾，壞版本的 Pod 會一直卡在那裡')
  assert(calls.slice(undo + 1).some(isStatus), 'rollout undo 之後也要 kubectl rollout status --timeout=… 等回滾完成，再 exit 1：不然 CI 以為已經回到好版本，其實還在換')
  assert.equal(dep.spec.template.spec.containers[0].image, 'learn-k8s/cafe-api:v2', `Deployment 的映像應該回到 v2，現在是 ${dep.spec.template.spec.containers[0].image}`)
  const images = readyPods(ns, SELECTOR).map((p: any) => p.spec.containers[0].image)
  assert.deepEqual(images, Array(4).fill('learn-k8s/cafe-api:v2'), `結束時應該有 4 個 Ready 的 v2 Pod，現在是 ${images.join('、') || '沒有'}`)
  assert.equal(load.errors, 0, `壞版本與回滾期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
})
