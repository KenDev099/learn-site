// 練習 1：cafe-api 的 Deployment：欄位正確、3 個 Pod Ready、刪掉一個會被同一個 ReplicaSet 補回來
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, kubeconform, nsName, podSummary, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(3, 1)
const LABELS = { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'main' }
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('deployment.yaml 是一個寫對的 Deployment（kubeconform 與欄位檢查）', { timeout: 30_000 }, () => {
  const docs = readYaml(dir, 'deployment.yaml')
  assert.equal(docs.length, 1, `deployment.yaml 只放一個物件（Deployment），現在有 ${docs.length} 個`)
  const d = docs[0]
  assert.equal(d.kind, 'Deployment', `kind 要是 Deployment，現在是 ${d.kind}：直接建的 Pod 被刪掉就不會回來`)
  assert.equal(d.apiVersion, 'apps/v1', 'Deployment 的 apiVersion 是 apps/v1')
  const v = kubeconform([join(dir, 'deployment.yaml')])
  assert(v.ok, `kubeconform 檢查沒過（欄位名稱、型別要對，例如 replicas 是數字不是字串）：\n${v.message}`)
  assert.equal(d.metadata?.name, 'cafe-api', 'Deployment 的名稱要是 cafe-api')
  assert.equal(d.spec.replicas, 3, 'spec.replicas 要是數字 3')
  assert.equal(d.spec.selector?.matchExpressions, undefined, '這題只用 matchLabels')
  assert.deepEqual(d.spec.selector?.matchLabels, LABELS, 'spec.selector.matchLabels 要剛好是 app.kubernetes.io/name: cafe-api 與 app.kubernetes.io/instance: main')
  const labels = d.spec.template?.metadata?.labels ?? {}
  for (const [k, val] of Object.entries(LABELS)) assert.equal(labels[k], val, `selector 的每個 label 都要出現在 spec.template.metadata.labels（缺 ${k}: ${val}），不然 API server 會拒絕`)
  const c = d.spec.template.spec?.containers?.[0]
  assert.equal(c?.name, 'api', '容器名稱要是 api（練習 3 用 set image 換映像時靠這個名字）')
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像要是 learn-k8s/cafe-api:v1')
  assert.equal(c.imagePullPolicy, 'IfNotPresent', 'imagePullPolicy 要是 IfNotPresent（映像已經 kind load 進節點）')
  assert.equal(c.env?.find((e: any) => e.name === 'REQUIRE_DB')?.value, '0', '要有環境變數 REQUIRE_DB，值是字串 "0"（這課還沒有資料庫）')
  assert.equal(c.resources?.requests?.cpu, '50m', 'requests.cpu 要是 50m')
  assert.equal(c.resources?.requests?.memory, '64Mi', 'requests.memory 要是 64Mi')
  assert.equal(c.resources?.limits?.memory, '128Mi', 'limits.memory 要是 128Mi')
})

test('套用後 3 個 Pod Ready；刪掉一個，同一個 ReplicaSet 會補回第 3 個', { timeout: 300_000 }, async () => {
  applyDir(dir, ns)
  const dep = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  const pods = await waitPodsReady(ns, SELECTOR, 3, 150_000)
  const owner = (o: any) => o.metadata.ownerReferences?.find((r: any) => r.controller)
  const victim = pods[0]
  const rsName = owner(victim)?.name
  assert.equal(owner(victim)?.kind, 'ReplicaSet', 'Pod 的擁有者應該是 ReplicaSet')
  const rs = kubeJson('get', 'replicaset', rsName, '-n', ns)
  assert.equal(owner(rs)?.uid, dep.metadata.uid, `ReplicaSet ${rsName} 的擁有者應該是 Deployment cafe-api`)

  const del = kube('delete', 'pod', victim.metadata.name, '-n', ns, '--wait=false')
  assert.equal(del.code, 0, `測試刪除 Pod 失敗：${del.stderr}`)
  const healed = await waitFor(() => {
    const all = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
    const ready = all.filter((p: any) => p.metadata.name !== victim.metadata.name && !p.metadata.deletionTimestamp
      && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
    if (ready.length !== 3) throw new Error(podSummary(all))
    return ready
  }, 120_000, '刪掉一個 Pod 之後，沒有在時間內回到 3 個 Ready')
  for (const p of healed) assert.equal(owner(p)?.name, rsName, `Pod ${p.metadata.name} 應該屬於同一個 ReplicaSet ${rsName}：只是補一份，Pod 範本沒變，不會產生新的 ReplicaSet`)
})
