// 練習 3：PDB（maxUnavailable 1）＋topologySpreadConstraints（nodeTaintsPolicy Honor），在負載下 drain 一個 worker：成功、0 錯誤
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeAsync, kubeJson, nsName, podSummary, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { readDeployment, readManifest, trafficDuring } from './lib.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(9, 3)
const LABELS = { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'drain-lab' }
const SELECTOR = Object.entries(LABELS).map(([k, v]) => `${k}=${v}`).join(',')
const NODE = 'learn-k8s-worker'
// 測試 cordon 節點前先在節點上做記號：上次測試中途被中斷、節點還是 cordon 的話，下次 before() 只恢復自己 cordon 的節點
const MARK = 'learn.kubernetes/cordoned-by'
let staticOk = false

function restoreNode() {
  const node = kubeJson('get', 'node', NODE)
  if (node.metadata.annotations?.[MARK] !== 'k8s-09-ex3') return
  kube('uncordon', NODE)
  kube('annotate', 'node', NODE, `${MARK}-`)
}
before(() => { requireCluster(); restoreNode() })
after(() => { restoreNode(); deleteNamespace(ns) })

const matches = (sel: any, labels: Record<string, string>) =>
  sel?.matchLabels && !sel.matchExpressions && Object.entries(sel.matchLabels).every(([k, v]) => labels[k] === v)

test('PDB maxUnavailable 1 選到 Deployment 的 Pod；分散規則用 hostname、maxSkew 1、DoNotSchedule、nodeTaintsPolicy Honor', { timeout: 30_000 }, () => {
  const { dep } = readDeployment(dir)
  assert.equal(dep.spec.replicas, 3, 'replicas 維持 3')
  assert.deepEqual(dep.spec.template.metadata.labels, LABELS, 'Pod 範本的 label 不要改')
  const docs = readManifest(dir, 'pdb.yaml')
  const pdb = docs.find(d => d.kind === 'PodDisruptionBudget')
  assert(pdb, 'pdb.yaml 裡還沒有 PodDisruptionBudget（apiVersion: policy/v1）')
  assert(pdb.spec.minAvailable === undefined, `不要用 minAvailable（現在是 ${pdb.spec.minAvailable}）：minAvailable 等於副本數時一個 Pod 都不能驅逐，drain 永遠卡住，平台團隊沒辦法升級節點。用 maxUnavailable: 1`)
  assert.equal(pdb.spec.maxUnavailable, 1, 'PDB 的 maxUnavailable 設 1：自願中斷時一次最多只能少 1 個 Pod')
  assert(matches(pdb.spec.selector, LABELS), `PDB 的 selector.matchLabels 選不到 Deployment 的 Pod（Pod 的 label：${SELECTOR}）：選不到的 PDB 等於沒有，drain 會同時驅逐全部`)
  const spread = dep.spec.template.spec.topologySpreadConstraints ?? []
  const host = spread.find((s: any) => s.topologyKey === 'kubernetes.io/hostname')
  assert(host, '在 spec.template.spec.topologySpreadConstraints 加一條 topologyKey: kubernetes.io/hostname 的規則（以節點為單位分散）')
  assert.equal(host.maxSkew, 1, 'maxSkew 設 1：任兩個節點的 Pod 數最多差 1')
  assert.equal(host.whenUnsatisfiable, 'DoNotSchedule', 'whenUnsatisfiable 設 DoNotSchedule：做不到平均就不排程（ScheduleAnyway 只是盡量）')
  assert(matches(host.labelSelector, LABELS), '分散規則的 labelSelector 要選到這個 Deployment 的 Pod，才知道要數哪些 Pod')
  assert.equal(host.nodeTaintsPolicy, 'Honor', 'nodeTaintsPolicy 設 Honor：預設 Ignore 會把有 taint、放不了 Pod 的 control-plane 和 cordon 中的節點也算成「0 個 Pod 的節點」，第 3 個 Pod 會一直 Pending')
  staticOk = true
})

test('3 個 Pod 分散在兩個 worker；每秒 10 個請求下 drain learn-k8s-worker 成功、0 錯誤', { timeout: 480_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  const pods = await waitPodsReady(ns, SELECTOR, 3, 180_000).catch(e => {
    throw new Error(`${e.message}\n有 Pod Pending 的話，用 kubectl describe pod 看 Events：「didn't match pod topology spread constraints」表示分散規則把不能放 Pod 的節點也算進去了`)
  })
  const nodes = new Set(pods.map((p: any) => p.spec.nodeName))
  assert(nodes.has(NODE) && nodes.has('learn-k8s-worker2'), `3 個 Pod 應該分散在兩個 worker，現在在：${pods.map((p: any) => p.spec.nodeName).join('、')}`)
  const pdb = await waitFor(() => { const s = kubeJson('get', 'pdb', 'cafe-api', '-n', ns).status; return s?.expectedPods === 3 && s.disruptionsAllowed === 1 && s }, 60_000,
    'PDB 的 status 應該是 expectedPods 3、disruptionsAllowed 1：用 kubectl get pdb -n ' + ns + ' 看 ALLOWED DISRUPTIONS')
  assert(pdb)
  const mark = kube('annotate', 'node', NODE, `${MARK}=k8s-09-ex3`, '--overwrite')
  assert.equal(mark.code, 0, `測試替節點加註記失敗：${mark.stderr}`)
  // --pod-selector 只驅逐這一題的 Pod，不打擾叢集裡其他練習；真正維護節點時不加，整台節點清空
  const { load, value: d } = await trafficDuring([`http://cafe-api.${ns}.svc.cluster.local/version`], 10, () =>
    kubeAsync(['drain', NODE, `--pod-selector=${SELECTOR}`, '--ignore-daemonsets', '--delete-emptydir-data', '--timeout=180s'], { timeout: 240_000 }))
  const podsAfter = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
  assert.equal(d.code, 0, `kubectl drain 沒有在 180 秒內完成：${(d.stderr || d.stdout).split('\n').slice(-3).join(' ')}\n${podSummary(podsAfter)}\n（一直出現「Cannot evict pod as it would violate the pod's disruption budget」表示被驅逐的 Pod 沒有新的副本補上，或 PDB 根本不允許中斷）`)
  assert.equal(load.errors, 0, `drain 期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
  restoreNode()
  const ready = await waitPodsReady(ns, SELECTOR, 3, 120_000)
  assert(ready.every((p: any) => p.spec.nodeName !== NODE), 'drain 之後被驅逐的 Pod 應該在其他節點重建')
})
