// 練習 1：收據寫在 PVC 上，Pod 刪掉重建後還在；單一 RWO 磁碟用 Recreate
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kube, kubeJson, nsName, probe, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { containerOf, only, readManifest, volumeAt, fresh } from './storage.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(11, 1)
const SELECTOR = 'app.kubernetes.io/name=cafe-api'
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('pvc.yaml 是 1Gi、ReadWriteOnce 的 receipts-data；Deployment 把它掛在 /data，用 Recreate、1 個副本', { timeout: 30_000 }, () => {
  const pvc = only(readManifest(dir, 'pvc.yaml'), 'PersistentVolumeClaim', 'receipts-data', 'pvc.yaml')
  assert.deepEqual(pvc.spec?.accessModes, ['ReadWriteOnce'], 'accessModes 寫 [ReadWriteOnce]：kind 的 local-path 和 EKS 的 EBS 都只支援單一節點讀寫')
  assert.equal(pvc.spec?.resources?.requests?.storage, '1Gi', 'resources.requests.storage 要是 1Gi')
  assert(pvc.spec.storageClassName === undefined || pvc.spec.storageClassName === 'standard', '不寫 storageClassName（用預設的 standard），或寫 standard')

  const dep = only(readManifest(dir, 'deployment.yaml'), 'Deployment', 'cafe-api', 'deployment.yaml')
  const c = containerOf(dep, 'api')
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  const vol = volumeAt(dep, c, '/data')
  assert(vol, '容器要在 /data 掛一個 volume：沒掛的話收據寫進容器自己的檔案系統，容器重啟、Pod 刪除都會不見')
  assert(!vol.emptyDir, '/data 還是 emptyDir：emptyDir 跟著 Pod 走，Pod 刪掉資料就沒了。改成 persistentVolumeClaim')
  assert.equal(vol.persistentVolumeClaim?.claimName, 'receipts-data', '/data 的 volume 要用 persistentVolumeClaim.claimName: receipts-data')
  assert.equal(dep.spec.replicas ?? 1, 1, 'replicas 維持 1：ReadWriteOnce 的磁碟只能掛在一個節點，多個副本不是卡在 ContainerCreating 就是同時寫同一份資料')
  assert.equal(dep.spec.strategy?.type, 'Recreate',
    'strategy.type 改成 Recreate：RollingUpdate 會先開新 Pod 再關舊 Pod，新 Pod 排到別的節點時掛不上同一顆 RWO 磁碟，換版就卡住')
  staticOk = true
})

test('套用後 PVC 是 Bound；POST 一張收據，刪掉 Pod，新的 Pod 用 GET /receipts 還看得到它', { timeout: 900_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  await fresh(ns)
  applyDir(dir, ns)
  const [first] = await waitPodsReady(ns, SELECTOR, 1, 300_000)
  const phase = kubeJson('get', 'pvc', 'receipts-data', '-n', ns).status?.phase
  assert.equal(phase, 'Bound', `PVC receipts-data 應該是 Bound，現在是 ${phase}（kubectl describe pvc receipts-data -n ${ns}）`)

  const post = probe(`http://${first.status.podIP}:3000/receipts`, { method: 'POST', body: JSON.stringify({ productId: 'latte', total: 110 }) })
  assert.equal(post.status, 201, `POST /receipts 應該回 201，現在是 ${post.status || post.error}：${post.body}`)
  const { id } = JSON.parse(post.body)

  const d = kube('delete', 'pod', first.metadata.name, '-n', ns, '--wait=true', '--timeout=120s')
  assert.equal(d.code, 0, `測試刪除 Pod 失敗：${d.stderr}`)
  const [second] = await waitPodsReady(ns, SELECTOR, 1, 360_000)
  assert.notEqual(second.metadata.uid, first.metadata.uid, '應該是 Deployment 重建的新 Pod')
  const get = probe(`http://${second.status.podIP}:3000/receipts`)
  assert.equal(get.status, 200, `GET /receipts 失敗：${get.status || get.error}`)
  const ids = JSON.parse(get.body).map((r: any) => r.id)
  assert(ids.includes(id), `新的 Pod 看不到剛才那張收據 ${id}（現在有：${ids.join('、') || '沒有'}）：/data 要掛 PVC，資料才會留在 Pod 之外`)
})
