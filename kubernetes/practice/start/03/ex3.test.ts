// 練習 3：release.sh 換版本並等待（壞版本要在時限內失敗），rollback.sh 用 rollout undo 回到上一版
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, freshNamespace, kubeIn, kubeJson, kubectlVerb, nsName, requireCluster, runScript, spyKubectl, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(3, 3)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'
const labels = { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'main' }
// 跟練習 1 的答案一樣，只多了 progressDeadlineSeconds: 120（預設 600 秒，測試等不了那麼久）
const deployment = JSON.stringify({
  apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'cafe-api', labels },
  spec: {
    replicas: 3, progressDeadlineSeconds: 120, selector: { matchLabels: labels },
    template: { metadata: { labels }, spec: { containers: [{
      name: 'api', image: 'learn-k8s/cafe-api:v1', imagePullPolicy: 'IfNotPresent', env: [{ name: 'REQUIRE_DB', value: '0' }],
      resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '128Mi' } },
    }] } },
  },
})
let uid = ''

before(async () => {
  requireCluster()
  freshNamespace(ns)
  const r = kubeIn(deployment, 'apply', '-n', ns, '-f', '-')
  if (r.code !== 0) throw new Error(`測試建立 Deployment 失敗：${r.stderr}`)
  uid = kubeJson('get', 'deployment', 'cafe-api', '-n', ns).metadata.uid
  await waitPodsReady(ns, SELECTOR, 3, 150_000)
})
after(() => deleteNamespace(ns))

function script(name: string, args: string[] = [], timeout = 300_000) {
  const spy = spyKubectl()
  try {
    const r = runScript(dir, name, args, { env: spy.env, timeout })
    return { ...r, calls: spy.calls() }
  } finally { spy.cleanup() }
}
const hasTimeout = (calls: string[][]) => calls.some(a => kubectlVerb(a).join(' ') === 'rollout status' && a.some(w => w.startsWith('--timeout')))
const readyImages = () => kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
  .filter((p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
  .map((p: any) => p.spec.containers[0].image)
function revisions() {
  return kubeJson('get', 'replicasets', '-n', ns).items
    .filter((r: any) => r.metadata.ownerReferences?.some((o: any) => o.uid === uid))
    .map((r: any) => ({ rev: Number(r.metadata.annotations?.['deployment.kubernetes.io/revision']), cause: r.metadata.annotations?.['kubernetes.io/change-cause'] ?? '' }))
    .sort((a: any, b: any) => a.rev - b.rev)
}

test('release.sh v2：等到 3 個 v2 的 Pod 都 Ready 才結束，history 有 change-cause', { timeout: 420_000 }, () => {
  const r = script('release.sh', ['v2'])
  assert.equal(r.code, 0, `release.sh v2 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  assert.deepEqual(r.calls.filter(a => ['delete', 'create', 'replace'].includes(kubectlVerb(a)[0])).map(a => a.join(' ')), [],
    '不要刪掉重建：改 Deployment 的 Pod 範本（kubectl set image），讓它滾動更新')
  const dep = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  assert.equal(dep.metadata.uid, uid, 'Deployment 被刪掉重建了：這樣會丟掉 rollout history，而且所有 Pod 會同時被換掉')
  assert.equal(dep.spec.template.spec.containers[0].image, 'learn-k8s/cafe-api:v2', '容器 api 的映像要換成 learn-k8s/cafe-api:v2')
  const images = readyImages()
  assert.deepEqual(images, ['learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2'],
    `腳本結束時應該已經有 3 個 Ready 的 v2 Pod（現在是 ${images.join('、') || '沒有'}）：用 kubectl rollout status 等它完成`)
  const revs = revisions()
  assert.equal(revs.length, 2, `rollout history 應該有 2 筆（v1、v2），實際 ${revs.length} 筆`)
  assert.match(revs[1].cause, /v2/, '最新一筆 revision 的 CHANGE-CAUSE 要包含 v2：用 kubectl annotate 寫 kubernetes.io/change-cause')
  assert(hasTimeout(r.calls), 'kubectl rollout status 要加 --timeout，壞版本時才不會一直等')
})

test('release.sh no-such-tag：在時限內以非 0 結束，舊版的 3 個 Pod 繼續服務', { timeout: 420_000 }, () => {
  const t0 = Date.now()
  const r = script('release.sh', ['no-such-tag'], 300_000)
  const secs = Math.round((Date.now() - t0) / 1000)
  assert.notEqual(r.code, null, `release.sh 跑了 ${secs} 秒還沒結束：rollout status 要加 --timeout（例如 180s）`)
  assert.notEqual(r.code, 0, '映像不存在時 release.sh 要以非 0 結束，CI 才知道部署失敗（set -e 會在 rollout status 失敗時停下來）')
  assert(hasTimeout(r.calls), `kubectl rollout status 要加 --timeout：這次是 Deployment 的 progressDeadlineSeconds（測試設成 120 秒）先到才結束，正式環境預設要等 600 秒`)
  const images = readyImages()
  assert.deepEqual(images, ['learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2'],
    `壞版本不該影響舊版：應該還有 3 個 Ready 的 v2 Pod，現在是 ${images.join('、') || '沒有'}`)
})

test('rollback.sh：用 rollout undo 回到上一個 revision（v2），3 個 Pod Ready', { timeout: 420_000 }, () => {
  const r = script('rollback.sh')
  assert.equal(r.code, 0, `rollback.sh 應該以 0 結束，實際是 ${r.code}：${r.stderr}`)
  assert(r.calls.some(a => kubectlVerb(a).join(' ') === 'rollout undo'), '用 kubectl rollout undo 回到上一個 revision，不要自己寫死映像 tag')
  const dep = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  assert.equal(dep.spec.template.spec.containers[0].image, 'learn-k8s/cafe-api:v2', '應該回到壞版本之前的最後一個好版本 v2，不是 v1')
  const images = readyImages()
  assert.deepEqual(images, ['learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2', 'learn-k8s/cafe-api:v2'],
    `rollback.sh 結束時應該有 3 個 Ready 的 v2 Pod（現在是 ${images.join('、') || '沒有'}）：undo 之後也要 rollout status --timeout 等它完成`)
  assert(hasTimeout(r.calls), 'rollback.sh 也要用 kubectl rollout status --timeout 等它完成')
})
