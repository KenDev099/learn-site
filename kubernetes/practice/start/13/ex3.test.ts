// 練習 3：設定變更要觸發 rollout：ConfigMap 範本＋Pod 範本的 checksum/config annotation
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, freshNamespace, kubeJson, nsName, podSummary, probe, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { container, helm, one, render } from './helm.ts'

const chart = join(import.meta.dirname, 'ex3', 'chart')
const ns = nsName(13, 3)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=cafe'
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

const podAnnotations = (set: Record<string, string>) => {
  const objs = render(chart, { set: { 'image.tag': 'v1', ...set } })
  return { objs, dep: one(objs, 'Deployment'), ann: one(objs, 'Deployment').spec.template.metadata?.annotations ?? {} }
}
const checksum = (ann: Record<string, string>) => Object.entries(ann).find(([k]) => k.startsWith('checksum/'))?.[1]

test('ConfigMap 的 data 來自 values.config，容器用 envFrom 讀它', { timeout: 30_000 }, () => {
  const { objs, dep } = podAnnotations({})
  const cm = one(objs, 'ConfigMap')
  assert.equal(cm.metadata.name, 'cafe-config', `ConfigMap 的名稱是 cafe.fullname 加上 -config，現在是 ${cm.metadata.name}`)
  assert.deepEqual(cm.data, { CAFE_MESSAGE: 'welcome', CAFE_OPEN_HOURS: '07:00-19:00' }, `ConfigMap 的 data 要等於 values.config，現在是 ${JSON.stringify(cm.data)}`)
  const refs = (container(dep).envFrom ?? []).map((e: any) => e.configMapRef?.name)
  assert(refs.includes('cafe-config'), '容器要用 envFrom.configMapRef 讀 cafe-config，設定才會變成環境變數')
})

test('只改 config 時 Pod 範本的 checksum annotation 會變；只改 replicas、或什麼都不改時不變', { timeout: 30_000 }, () => {
  const a = podAnnotations({})
  const sum = checksum(a.ann)
  assert(sum, `Pod 範本（spec.template.metadata.annotations）要有 checksum/config。${checksum(a.dep.metadata.annotations ?? {}) ? '你放在 Deployment 自己的 metadata：那裡變了不會換 Pod，只有 Pod 範本變了才會滾動更新' : ''}`)
  const again = checksum(podAnnotations({}).ann)
  assert.equal(again, sum, 'values 完全沒變，checksum 卻不一樣：不要用 now 或亂數，否則每次 helm upgrade 都會重啟所有 Pod。用 configmap.yaml 輸出內容的 sha256sum')
  const changed = checksum(podAnnotations({ 'config.CAFE_MESSAGE': 'happy-hour' }).ann)
  assert.notEqual(changed, sum, '改了 values.config，checksum 要跟著變：用 include (print $.Template.BasePath "/configmap.yaml") . | sha256sum')
  const replicas = checksum(podAnnotations({ replicas: '3' }).ann)
  assert.equal(replicas, sum, '只改 replicas 時 checksum 不該變：雜湊只算 ConfigMap 的內容，不是整份 values')
  staticOk = true
})

test('叢集：helm upgrade 只改 config，所有 Pod 被換掉，GET /config 看到新值', { timeout: 600_000 }, async () => {
  assert(staticOk, '先讓上一項（helm template 的檢查）通過，再部署到叢集')
  freshNamespace(ns)
  const install = helm('upgrade', '--install', 'cafe', chart, '-n', ns, '--set', 'image.tag=v1', '--wait', '--timeout', '4m')
  assert.equal(install.code, 0, `helm upgrade --install 失敗：${install.stderr}\n${podSummary(kubeJson('get', 'pods', '-n', ns).items)}`)
  const before = (await waitPodsReady(ns, SELECTOR, 2, 120_000)).map(p => p.metadata.uid)

  const up = helm('upgrade', 'cafe', chart, '-n', ns, '--set', 'image.tag=v1', '--set', 'config.CAFE_MESSAGE=happy-hour', '--wait', '--timeout', '4m')
  assert.equal(up.code, 0, `只改 config 的 helm upgrade 失敗：${up.stderr}\n${podSummary(kubeJson('get', 'pods', '-n', ns).items)}`)
  const after = await waitPodsReady(ns, SELECTOR, 2, 180_000)
  const kept = after.filter(p => before.includes(p.metadata.uid))
  assert.equal(kept.length, 0, `升級後還有 ${kept.length} 個舊 Pod：ConfigMap 改了但 Pod 範本沒變，Deployment 不會換 Pod，舊 Pod 的環境變數還是舊值`)
  const r = probe(`http://cafe.${ns}.svc.cluster.local/config`)
  assert.equal(r.status, 200, `GET /config 應該回 200，現在是 ${r.status || r.error}`)
  assert.equal(JSON.parse(r.body).CAFE_MESSAGE, 'happy-hour', `GET /config 的 CAFE_MESSAGE 應該是 happy-hour：${r.body}`)
})
