// 練習 3：Pod Security Admission restricted：namespace 由測試加標籤，Pod 要自己符合
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, nsName, probe, requireCluster, waitFor } from '../../helpers/k8s.ts'
import { describe, exec, readManifest, waitDefaultSa } from './lib.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(12, 3)
const SELECTOR = 'app.kubernetes.io/name=cafe-api'
const PSA = { 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/warn': 'restricted' }
let staticOk = false, dryOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('deployment.yaml：只有 Deployment cafe-api（不能自己改 namespace），根目錄唯讀、/tmp 是 emptyDir', { timeout: 30_000 }, () => {
  const docs = readManifest(dir, 'deployment.yaml')
  assert(!docs.some(d => d.kind === 'Namespace'), '不要在檔案裡寫 Namespace：安全等級是平台（namespace 的標籤）決定的，應用要符合它，不是把它調低')
  assert(docs.length === 1 && docs[0].kind === 'Deployment' && docs[0].metadata?.name === 'cafe-api', `deployment.yaml 只放 Deployment cafe-api，現在是 ${describe(docs)}`)
  const spec = docs[0].spec.template.spec
  const c = spec.containers?.find((x: any) => x.name === 'api')
  assert(c, '要有名為 api 的容器')
  assert.equal(c.securityContext?.readOnlyRootFilesystem, true, '容器 api 要設 readOnlyRootFilesystem: true（restricted 沒有要求，但這題要做）')
  const m = (c.volumeMounts ?? []).find((v: any) => v.mountPath === '/tmp')
  const vol = m && (spec.volumes ?? []).find((v: any) => v.name === m.name)
  assert(vol?.emptyDir, '在 /tmp 掛一個 emptyDir：根目錄唯讀後，POST /uploads 只能寫這裡')
  staticOk = true
})

test('kubectl apply --dry-run=server 在 restricted 的 namespace 沒有任何 PodSecurity 警告', { timeout: 120_000 }, () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過')
  freshNamespace(ns, PSA)
  const r = kube('apply', '-n', ns, '-R', '-f', dir, '--dry-run=server')
  assert.equal(r.code, 0, `kubectl apply --dry-run=server 失敗：${r.stderr}`)
  const warn = r.stderr.split('\n').filter(l => /PodSecurity/.test(l))
  assert.deepEqual(warn, [], `還有不符合 restricted 的地方，照警告逐一修：\n${warn.join('\n')}`)
  dryOk = true
})

test('3 個 Pod Ready、以 UID 1000 執行、POST /uploads 成功，namespace 仍是 restricted', { timeout: 420_000 }, async () => {
  assert(dryOk, '先讓上一項（dry-run 沒有警告）通過')
  await waitDefaultSa(ns)
  applyDir(dir, ns)
  const pods = await waitFor(() => {
    const items = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
      .filter((p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
    if (items.length === 3) return items
    const ev = kubeJson('get', 'events', '-n', ns, '--field-selector', 'reason=FailedCreate').items
    throw new Error(ev.length ? `ReplicaSet 建不出 Pod：${ev.at(-1).message}` : `現在 Ready 的 Pod 有 ${items.length} 個`)
  }, 300_000, '沒有等到 3 個 Ready 的 Pod（kubectl describe rs -n k8s-12-ex3 看 FailedCreate）', 3000)
  const labels = kubeJson('get', 'namespace', ns).metadata.labels
  assert.equal(labels['pod-security.kubernetes.io/enforce'], 'restricted', `namespace 的 enforce 等級被改成 ${labels['pod-security.kubernetes.io/enforce']}：不要動 namespace 的標籤`)
  const id = exec(ns, pods[0].metadata.name, 'id', '-u')
  assert.equal(id.stdout, '1000', `容器應該以 UID 1000 執行，現在是 ${id.stdout || id.stderr}`)
  const up = probe(`http://${pods[0].status.podIP}:3000/uploads`, { method: 'POST', body: JSON.stringify({ photo: 'latte-art' }) })
  assert.equal(up.status, 200, `POST /uploads 應該回 200，現在是 ${up.status || up.error}：${up.body}（根目錄唯讀時 /tmp 要掛 emptyDir）`)
})
