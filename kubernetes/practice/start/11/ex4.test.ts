// 練習 4：根目錄唯讀，只有 /tmp 用 emptyDir（sizeLimit 64Mi）可以寫；寫超過上限 Pod 會被驅逐
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kubeJson, nsName, probe, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { containerOf, exec, only, podEvents, readManifest, volumeAt, fresh } from './storage.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(11, 4)
const SELECTOR = 'app.kubernetes.io/name=cafe-api'
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('readOnlyRootFilesystem 維持 true，/tmp 掛 emptyDir、sizeLimit 64Mi', { timeout: 30_000 }, () => {
  const dep = only(readManifest(dir, 'deployment.yaml'), 'Deployment', 'cafe-api', 'deployment.yaml')
  const c = containerOf(dep, 'api')
  assert.equal(c.securityContext?.readOnlyRootFilesystem, true,
    '不能拿掉 readOnlyRootFilesystem: true：唯讀根目錄讓入侵者沒辦法改程式、放工具。只開放真正需要寫的目錄')
  const vol = volumeAt(dep, c, '/tmp')
  assert(vol, '容器要在 /tmp 掛一個 volume：根目錄唯讀時，只有掛載的 volume 可以寫')
  assert(!vol.persistentVolumeClaim, '/tmp 不要用 PVC：上傳的暫存檔處理完就不要了，不需要活過 Pod；用 emptyDir（長期保存的檔案放 S3）')
  assert(vol.emptyDir, '/tmp 的 volume 要是 emptyDir')
  assert.equal(vol.emptyDir.sizeLimit, '64Mi',
    'emptyDir 要設 sizeLimit: 64Mi：沒有上限時，一個失控的上傳可以寫滿節點的磁碟，影響同節點的所有 Pod')
  assert.notEqual(vol.emptyDir.medium, 'Memory', '這題不用 medium: Memory：寫進 tmpfs 的檔案算在容器的記憶體裡，64Mi 的上傳會讓 128Mi 的容器很快 OOMKilled')
  staticOk = true
})

test('POST /uploads 回 200、寫 /app 仍然失敗；在 /tmp 寫 80MB 後 Pod 因超過 sizeLimit 被驅逐', { timeout: 900_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  await fresh(ns)
  applyDir(dir, ns)
  const [pod] = await waitPodsReady(ns, SELECTOR, 1, 300_000)
  const name = pod.metadata.name
  const up = probe(`http://${pod.status.podIP}:3000/uploads`, { method: 'POST', body: JSON.stringify({ photo: 'latte-art' }) })
  assert.equal(up.status, 200, `POST /uploads 應該回 200，現在是 ${up.status || up.error}：${up.body}`)

  const w = exec(ns, name, 'api', 'sh', '-c', 'echo x > /app/x')
  assert.notEqual(w.code, 0, '在容器裡寫 /app/x 竟然成功了：根目錄應該是唯讀的')
  assert.match(w.stderr, /Read-only file system/, `寫 /app/x 應該因為唯讀失敗，現在的錯誤：${w.stderr}`)

  const dd = exec(ns, name, 'api', 'dd', 'if=/dev/zero', 'of=/tmp/big', 'bs=1M', 'count=80')
  assert.equal(dd.code, 0, `測試在 /tmp 寫 80MB 失敗：${dd.stderr}`)
  // kubelet 定期量 emptyDir 的用量（這台約 1 分鐘內），超過 sizeLimit 就驅逐整個 Pod
  const p = await waitFor(() => {
    const cur = kubeJson('get', 'pod', name, '-n', ns)
    return cur.status?.reason === 'Evicted' ? cur : null
  }, 240_000, `Pod ${name} 在 /tmp 寫了 80MB 卻沒有被驅逐：檢查 emptyDir 的 sizeLimit 是 64Mi`, 3000)
  assert.match(p.status.message ?? '', /EmptyDir|exceeds/i, `驅逐原因應該是 emptyDir 超過上限，現在是：${p.status.message}`)
  const ev = podEvents(ns, name)
  assert(ev.some(e => e.reason === 'Evicted'), `Pod 的 Events 裡應該有 reason Evicted：${JSON.stringify(ev)}`)
})
