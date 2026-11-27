// 練習 2：修好 ex2/pod.yaml 的三個錯，讓 cafe-api 跑起來而且不重啟
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kube, kubeconform, nsName, readYaml, requireCluster, sleep } from '../../helpers/k8s.ts'
import { freshPodNamespace, waitPodReady } from './pods.ts'

const dir = join(import.meta.dirname, 'ex2')
const file = join(dir, 'pod.yaml')
const ns = nsName(2, 2)
let staticOk = false

before(async () => { requireCluster(); await freshPodNamespace(ns) })
after(() => deleteNamespace(ns))

test('kubeconform 與 kubectl apply --dry-run=server 都通過，port 宣告與重啟規則沒被拿掉', { timeout: 60_000 }, () => {
  const v = kubeconform([file])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  const d = kube('apply', '-n', ns, '--dry-run=server', '-f', file)
  assert.equal(d.code, 0, `kubectl apply --dry-run=server 被 API server 拒絕（kubeconform 只看欄位的型別，API server 還會檢查值）：\n${d.stderr}`)
  const pod = readYaml(dir, 'pod.yaml')[0]
  const c = pod.spec.containers[0]
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1，不用改')
  assert((c.ports ?? []).some((p: any) => p.containerPort === 3000), 'containerPort 3000 要放在 ports 清單裡（ports: - containerPort: 3000），不是刪掉')
  assert(pod.spec.restartPolicy === undefined || pod.spec.restartPolicy === 'Always',
    `restartPolicy 是 ${pod.spec.restartPolicy}：改成 Never 只是讓錯誤看不見（容器結束就不重開），要修的是容器為什麼會結束`)
  assert.equal(pod.metadata.labels?.['app.kubernetes.io/name'], 'cafe-api', 'label app.kubernetes.io/name: cafe-api 要留著')
  staticOk = true
})

test('套用後 Running、重啟 0 次，log 第一行是 JSON 的 "msg":"listening"', { timeout: 240_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  await waitPodReady(ns, 'cafe-api', 180_000)
  await sleep(3000)   // 剛 Ready 就結束的容器，多等一下才看得到重啟
  const r = kube('get', 'pod', 'cafe-api', '-n', ns, '-o', 'json')
  const pod = JSON.parse(r.stdout)
  assert.equal(pod.status.phase, 'Running', `Pod 的 phase 要是 Running，實際是 ${pod.status.phase}`)
  assert.equal(pod.status.containerStatuses[0].restartCount, 0, '容器重啟過：用 kubectl logs cafe-api --previous 看結束前印了什麼')
  const first = kube('logs', 'cafe-api', '-n', ns).stdout.split('\n')[0]
  let line: any
  try { line = JSON.parse(first) } catch { assert.fail(`log 第一行不是 JSON：${first}`) }
  assert.equal(line.msg, 'listening', `log 第一行應該是 cafe-api 的 {"msg":"listening",…}，實際是 ${first}`)
})
