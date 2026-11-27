// 練習 5：HPA（autoscaling/v2）依 CPU 把 cafe-api 從 2 擴到 ≥ 3，負載停了再縮回 2
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeJson, load, nsName, requireCluster, sleep, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { cpuMilli, readDeployment, readDocs } from './res.ts'

const dir = join(import.meta.dirname, 'ex5')
const ns = nsName(8, 5)
let depOk = false, staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('Deployment：沒有 replicas 欄位、容器有 CPU requests', { timeout: 10_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert(!('replicas' in dep.spec),
    `Deployment 還寫著 replicas: ${dep.spec.replicas}：HPA 接手後，每次 kubectl apply 都會把副本數改回這個值（尖峰時從 5 個被砍回 ${dep.spec.replicas} 個）。把這一行刪掉，交給 HPA 管`)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  const cpu = c.resources?.requests?.cpu
  assert(cpu !== undefined,
    '容器沒有 resources.requests.cpu：HPA 的 CPU 使用率 = 實際用量 ÷ requests，沒有分母就算不出來，kubectl get hpa 會顯示 <unknown>，永遠不會擴展')
  assert.equal(cpuMilli(cpu), 100, `requests.cpu 是 ${cpu}：要 100m`)
  depOk = true
})

test('HPA：autoscaling/v2、2～5 個副本、CPU 60%、縮容穩定視窗 ≤ 30 秒', { timeout: 10_000 }, () => {
  const hpa = readDocs(dir, 'hpa.yaml').find(d => d.kind === 'HorizontalPodAutoscaler')
  assert(hpa, 'hpa.yaml 裡還沒有 HorizontalPodAutoscaler')
  assert.equal(hpa.apiVersion, 'autoscaling/v2', `apiVersion 是 ${hpa.apiVersion}：用 autoscaling/v2（metrics 與 behavior 都在 v2）`)
  assert.equal(hpa.metadata?.name, 'cafe-api', 'HPA 的名稱是 cafe-api')
  const ref = hpa.spec.scaleTargetRef
  assert(ref?.apiVersion === 'apps/v1' && ref?.kind === 'Deployment' && ref?.name === 'cafe-api',
    'scaleTargetRef 要指向 apiVersion apps/v1、kind Deployment、name cafe-api')
  assert.notEqual(hpa.spec.minReplicas ?? 1, 1,
    'minReplicas 是 1（不寫也是 1）：只剩一個副本時，節點維護、Pod 被驅逐或換版都會中斷服務。正式服務至少 2')
  assert.equal(hpa.spec.minReplicas, 2, `minReplicas 是 ${hpa.spec.minReplicas}：要 2`)
  assert.equal(hpa.spec.maxReplicas, 5, `maxReplicas 是 ${hpa.spec.maxReplicas}：要 5`)
  const ms = hpa.spec.metrics ?? []
  const m = ms.find((x: any) => x.type === 'Resource' && x.resource?.name === 'cpu')
  assert(ms.length === 1 && m, 'metrics 只放一項：type: Resource、resource.name: cpu')
  assert.equal(m.resource.target?.type, 'Utilization', 'target.type 用 Utilization（以 requests 為分母的百分比）')
  assert.equal(m.resource.target.averageUtilization, 60, `averageUtilization 是 ${m.resource.target.averageUtilization}：要 60`)
  const win = hpa.spec.behavior?.scaleDown?.stabilizationWindowSeconds
  assert(win !== undefined, '還沒有 behavior.scaleDown.stabilizationWindowSeconds：預設 300 秒，測試要等 5 分鐘以上才看得到縮容')
  assert(win <= 30, `stabilizationWindowSeconds 是 ${win}：練習用 30 秒以內`)
  staticOk = true
})

test('叢集：對 /burn 加壓 120 秒擴到 ≥ 3 個副本，停止後 4 分鐘內縮回 2', { timeout: 600_000 }, async () => {
  assert(depOk && staticOk, '先讓上面兩項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 2, 150_000)
  const hpa = () => kubeJson('get', 'hpa', 'cafe-api', '-n', ns)
  await waitFor(() => hpa().status?.currentMetrics?.[0]?.resource?.current?.averageUtilization !== undefined, 150_000,
    'HPA 一直拿不到 CPU 使用率（kubectl get hpa 顯示 <unknown>）：用 kubectl describe hpa cafe-api 看 Events', 5000)

  let max = 0, done = false
  const replicas = () => kubeJson('get', 'deployment', 'cafe-api', '-n', ns).spec.replicas
  const watch = (async () => { while (!done) { max = Math.max(max, replicas()); await sleep(5000) } })()
  try {
    // 每秒 20 個請求、每個佔 20ms CPU：約 400m，以每個 Pod 100m 的 requests 計，2 個副本的使用率約 200%
    await load(`http://cafe-api.${ns}.svc.cluster.local/burn?ms=20`, { requests: 2400, rps: 20, timeoutMs: 15_000 })
  } finally { done = true }
  await watch
  max = Math.max(max, replicas())
  assert(max >= 3, `加壓 120 秒期間副本數最多只到 ${max}：用 kubectl describe hpa cafe-api 看 TARGETS 與 Events`)

  await waitFor(() => replicas() === 2, 240_000, '負載停止後副本數沒有縮回 2：檢查 behavior.scaleDown 的設定', 5000)
})
