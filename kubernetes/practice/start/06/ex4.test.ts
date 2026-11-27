// 練習 4：Pod 卡在 CreateContainerConfigError：secretKeyRef 的 key 打錯。修 Deployment，不用 optional 掩蓋，並寫下診斷
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeconform, nsName, readText, requireCluster } from '../../helpers/k8s.ts'
import { container, readAll, waitConfigs } from './cafe.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(6, 4)
const password = randomBytes(12).toString('hex')
let staticOk = false

before(() => {
  requireCluster()
  freshNamespace(ns)
  // 這個 Secret 由「別的團隊」管理：key 叫 password
  const s = kube('create', 'secret', 'generic', 'cafe-db', '-n', ns, `--from-literal=password=${password}`)
  if (s.code !== 0) throw new Error(`測試建立 Secret cafe-db 失敗：${s.stderr}`)
})
after(() => deleteNamespace(ns))

test('diagnosis.md 寫出狀態、看到原因的指令與缺的 key', { timeout: 10_000 }, () => {
  const text = readText(dir, 'diagnosis.md')
  assert.match(text, /CreateContainerConfigError/, 'diagnosis.md 要寫出 Pod 卡住的狀態（kubectl get pods 的 STATUS 欄原文）')
  assert.doesNotMatch(text, /CrashLoopBackOff/, 'CrashLoopBackOff 是容器啟動後一直結束；這題的容器根本沒被建立，狀態不是它')
  assert.match(text, /kubectl\s+describe/, 'diagnosis.md 要寫出看到原因的指令：kubectl describe pod …，原因在最下面的 Events')
  assert.match(text, /db-password/, 'diagnosis.md 要寫出 Events 裡說找不到的那個 key')
})

test('deployment.yaml 改對 key，沒有 optional、沒有自己寫 Secret', { timeout: 30_000 }, () => {
  const docs = readAll(dir)
  assert.deepEqual(docs.filter(d => d.kind === 'Secret').map(d => d.metadata?.name), [],
    'Secret cafe-db 是別人管的，你改不到它，也不要自己寫一份（測試建立的 Secret 才是正式的值）：改 Deployment 引用的 key')
  const v = kubeconform([dir])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  assert.doesNotMatch(readText(dir, 'deployment.yaml'), /optional\s*:\s*true/,
    '不要加 optional: true：Pod 會在沒有密碼的情況下啟動，錯誤延後到第一次連資料庫才爆出來')
  const ref = (container(docs).env ?? []).find((e: any) => e.name === 'PGPASSWORD')?.valueFrom?.secretKeyRef
  assert(ref, 'PGPASSWORD 要留著，用 valueFrom.secretKeyRef 從 Secret 讀')
  assert.equal(ref.name, 'cafe-db', 'secretKeyRef.name 維持 cafe-db')
  assert.equal(ref.key, 'password', `secretKeyRef.key 現在是 ${ref.key}：用 kubectl get secret cafe-db -o jsonpath='{.data}' 看 Secret 裡真正的 key 叫什麼`)
  staticOk = true
})

test('套用後 Pod Ready，PGPASSWORD 是 Secret 的值', { timeout: 240_000 }, async () => {
  assert(staticOk, '先讓上一項（deployment.yaml 的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  const [{ pod }] = await waitConfigs(ns, 1, () => true, 180_000, `${ns} 裡的 cafe-api 沒有 Ready，用 kubectl describe pod -n ${ns} 看 Events`)
  const r = kube('exec', '-n', ns, pod.metadata.name, '-c', 'api', '--', 'printenv', 'PGPASSWORD')
  assert.equal(r.stdout, password, '容器裡的 PGPASSWORD 要是 Secret cafe-db 的 password')
})
