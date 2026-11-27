// 練習 2：150MB 的報表請求讓 128Mi 的容器被 OOMKilled → 寫下診斷，調大 limit 並把 heap 上限設在 limit 的 80% 以下
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeIn, kubeJson, nsName, podSummary, probe, readJson, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { bytes, envOf, memUnitProblem, mib, readDeployment } from './res.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(8, 2)
const SELECTOR = 'app.kubernetes.io/name=cafe-api'
const URL = `http://cafe-api.${ns}.svc.cluster.local/alloc?mb=150`
let diagOk = false, staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('ex2-diagnosis.json 寫下容器上次結束的 reason 與 exitCode', { timeout: 10_000 }, () => {
  const d = readJson(import.meta.dirname, 'ex2-diagnosis.json')
  assert.notEqual(d.reason, 'CrashLoopBackOff',
    'CrashLoopBackOff 是「一直重啟、kubelet 在等下一次重啟」的等待狀態，不是容器結束的原因。看 kubectl get pod -o yaml 裡 lastState.terminated.reason')
  assert.equal(d.reason, 'OOMKilled', `reason 是 ${JSON.stringify(d.reason)}：用 kubectl describe pod 看 Last State 的 Reason，或 kubectl get pod <名稱> -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'`)
  assert.equal(typeof d.exitCode, 'number', 'exitCode 寫數字，不要加引號')
  assert.equal(d.exitCode, 137, `exitCode 是 ${d.exitCode}：被核心的 OOM killer 用 SIGKILL（9）殺掉的程序，結束碼是 128＋9`)
  diagOk = true
})

test('limits.memory ≤ 512Mi，NODE_OPTIONS 的 --max-old-space-size 小於 limit 的 80%', { timeout: 10_000 }, () => {
  const { c } = readDeployment(dir)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  const lim = c.resources?.limits?.memory
  assert(lim !== undefined, '不能把 limits.memory 拿掉：沒有上限，一個洩漏或一次超大的請求就能吃光節點記憶體，拖垮同一台節點上別人的 Pod。要把它調到「夠用」而不是「不設」')
  const p = memUnitProblem('limits.memory', lim)
  assert(!p, p ?? '')
  assert(bytes(lim) <= bytes('512Mi'), `limits.memory 是 ${lim}：這個服務的記憶體預算是 512Mi。150MB 的請求加上 Node 本身約 40～60MB，不需要給到 ${lim}；limit 給太大，排程與容量規劃都會失真`)
  const req = c.resources?.requests?.memory
  assert(req !== undefined && bytes(req) <= bytes(lim), 'requests.memory 要保留，而且不能比 limits.memory 大')
  const opts = envOf(c, 'NODE_OPTIONS')
  assert(opts, '容器還沒有 NODE_OPTIONS 環境變數：用它傳 --max-old-space-size=<MB> 給 node')
  const m = /--max-old-space-size=(\d+)/.exec(opts)
  assert(m, `NODE_OPTIONS 是 ${JSON.stringify(opts)}：要包含 --max-old-space-size=<MB>（整數，單位是 MiB）`)
  const heap = Number(m[1]), limit = mib(lim)
  assert(heap < limit * 0.8,
    `--max-old-space-size=${heap} 是 limit ${limit}Mi 的 ${Math.round(heap / limit * 100)}%：heap 之外還有 Buffer、程式碼與原生記憶體，heap 上限要留空間，設在 limit 的 80% 以下（常見 70～75%）。heap 上限接近 limit 時，V8 覺得還沒滿、不急著 GC，容器就先被核心殺掉`)
  staticOk = true
})

// 容器目前（或上一次）結束的資訊
function lastTerminated(): any {
  const pod = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items.find((x: any) => !x.metadata.deletionTimestamp)
  return pod?.status?.containerStatuses?.[0]?.lastState?.terminated
}

test('叢集：原本的 128Mi 重現 OOMKilled；套用你的設定後同一個請求回 200、沒有重啟', { timeout: 420_000 }, async () => {
  assert(diagOk && staticOk, '先讓上面兩項（檔案的檢查）通過，再套用到叢集')
  const diag = readJson(import.meta.dirname, 'ex2-diagnosis.json')
  freshNamespace(ns)

  // 1. 用起始的資源設定（limit 128Mi、沒有 NODE_OPTIONS）重現
  const { dep } = readDeployment(dir)
  const before = structuredClone(dep)
  const c = before.spec.template.spec.containers.find((x: any) => x.name === 'api')
  c.resources = { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '128Mi' } }
  c.env = (c.env ?? []).filter((e: any) => e.name !== 'NODE_OPTIONS')
  const a = kubeIn(JSON.stringify(before), 'apply', '-n', ns, '-f', '-')
  assert.equal(a.code, 0, `套用起始設定失敗：${a.stderr}`)
  applyDir(join(dir, 'service.yaml'), ns)
  await waitPodsReady(ns, SELECTOR, 1, 150_000)
  const r1 = probe(URL, { method: 'POST', timeoutSec: 20 })
  assert.notEqual(r1.status, 200, '起始設定（limit 128Mi）下報表請求竟然成功了，無法重現；再跑一次測試')
  const t = await waitFor(lastTerminated, 60_000, '起始設定下容器沒有被殺掉重啟')
  assert.equal(t.reason, diag.reason, `重現時 reason 是 ${t.reason}，跟 ex2-diagnosis.json 寫的 ${diag.reason} 不同`)
  assert.equal(t.exitCode, diag.exitCode, `重現時 exitCode 是 ${t.exitCode}，跟 ex2-diagnosis.json 寫的 ${diag.exitCode} 不同`)

  // 2. 套用學習者的設定
  applyDir(join(dir, 'deployment.yaml'), ns)
  const ro = kube('rollout', 'status', 'deployment/cafe-api', '-n', ns, '--timeout=180s')
  assert.equal(ro.code, 0, `套用你的設定後 Deployment 沒有完成更新：${ro.stderr || ro.stdout}\n${podSummary(kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items)}`)
  await waitPodsReady(ns, SELECTOR, 1, 120_000)
  for (let i = 1; i <= 2; i++) {
    const r = probe(URL, { method: 'POST', timeoutSec: 20 })
    assert.equal(r.status, 200, `第 ${i} 次報表請求失敗（${r.status || r.error}）：limit 還不夠大，容器又被殺掉了。150MB 之外，Node 本身還要 40～60MB`)
  }
  const pod = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items.find((x: any) => !x.metadata.deletionTimestamp)
  const restarts = pod.status.containerStatuses[0].restartCount
  assert.equal(restarts, 0, `處理報表請求後容器重啟了 ${restarts} 次：${podSummary([pod])}`)
})
