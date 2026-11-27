// 練習 1：ClusterIP Service cafe-api：port 80 → 具名 targetPort http，只挑到自己的 3 個 Pod
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeIn, kubeJson, kubeconform, load, nsName, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(4, 1)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'

// 同一個 namespace 裡的「金絲雀」：name 一樣是 cafe-api，只有 instance 不同。Service 的 selector 少寫 instance 就會挑到它
const decoy = {
  apiVersion: 'apps/v1', kind: 'Deployment',
  metadata: { name: 'cafe-api-canary' },
  spec: {
    replicas: 1,
    selector: { matchLabels: { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'canary' } },
    template: {
      metadata: { labels: { 'app.kubernetes.io/name': 'cafe-api', 'app.kubernetes.io/instance': 'canary' } },
      spec: {
        containers: [{
          name: 'api', image: 'learn-k8s/cafe-api:v1', imagePullPolicy: 'IfNotPresent',
          ports: [{ name: 'http', containerPort: 3000 }],
          env: [{ name: 'REQUIRE_DB', value: '0' }, { name: 'ECHO_NAME', value: 'canary' }],
          resources: { requests: { cpu: '20m', memory: '48Mi' }, limits: { memory: '128Mi' } },
        }],
      },
    },
  },
}

const objects = () => [...readYaml(dir, 'deployment.yaml'), ...readYaml(dir, 'service.yaml')]
const serviceOf = (docs: any[]) => {
  const svc = docs.find(d => d.kind === 'Service' && d.metadata?.name === 'cafe-api')
  assert(svc, 'service.yaml 裡找不到名為 cafe-api 的 Service（kind: Service、metadata.name: cafe-api）')
  return svc
}

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('Service 寫對：ClusterIP、port 80、targetPort 用容器 port 的名字 http', { timeout: 30_000 }, () => {
  const docs = objects()
  const v = kubeconform([join(dir, 'deployment.yaml'), join(dir, 'service.yaml')])
  assert(v.ok, `kubeconform 檢查沒過（欄位名稱、縮排、型別要對）：\n${v.message}`)
  const svc = serviceOf(docs)
  assert(svc.spec?.type === undefined || svc.spec.type === 'ClusterIP', `這題要叢集內部用的 ClusterIP，現在 type 是 ${svc.spec?.type}`)
  const ports = svc.spec?.ports ?? []
  assert.equal(ports.length, 1, 'Service 只要一個 port')
  assert.equal(ports[0].port, 80, `Service 的 port 要是 80，現在是 ${ports[0].port}：呼叫端寫 http://cafe-api 就會連到 80，3000 是容器裡的 port，交給 targetPort`)
  assert.equal(typeof ports[0].targetPort, 'string', `targetPort 要寫容器 port 的名字（http），不要寫數字 ${ports[0].targetPort}：之後改容器的 port 只要改 Deployment 一個地方`)
  assert.equal(ports[0].targetPort, 'http', 'targetPort 要是 http')
  const dep = docs.find(d => d.kind === 'Deployment')
  const cports = dep?.spec?.template?.spec?.containers?.[0]?.ports ?? []
  assert(cports.some((p: any) => p.name === 'http' && p.containerPort === 3000),
    'deployment.yaml 的容器要宣告 ports：- name: http、containerPort: 3000，Service 的 targetPort: http 才找得到對應的 port')
})

test('從叢集裡呼叫 http://cafe-api.k8s-04-ex1 200 次：全部成功、分散到至少 2 個 Pod、沒有打到別的 Deployment', { timeout: 360_000 }, async () => {
  serviceOf(objects())
  const d = kubeIn(JSON.stringify(decoy), 'apply', '-n', ns, '-f', '-')
  assert.equal(d.code, 0, `測試建立 cafe-api-canary 失敗：${d.stderr}`)
  applyDir(dir, ns)
  const pods = await waitPodsReady(ns, SELECTOR, 3, 240_000)
  const canary = await waitPodsReady(ns, 'app.kubernetes.io/instance=canary', 1, 240_000)
  // Pod Ready 之後，EndpointSlice 還要一下子才更新
  await waitFor(() => {
    const slices = kubeJson('get', 'endpointslice', '-n', ns, '-l', 'kubernetes.io/service-name=cafe-api').items
    return slices.flatMap((s: any) => s.endpoints ?? []).filter((e: any) => e.conditions?.ready).length >= 3
  }, 60_000, 'Service cafe-api 的 EndpointSlice 沒有出現 3 個 ready 的 endpoint：檢查 selector 是否跟 Pod 的 label 一致（kubectl get endpointslice -n k8s-04-ex1 -l kubernetes.io/service-name=cafe-api）')

  const r = await load('http://cafe-api.k8s-04-ex1/health/live', { requests: 200, rps: 40 })
  assert.equal(r.ok, 200, `200 個請求只有 ${r.ok} 個成功（${JSON.stringify(r.statuses)}）：${r.errorSamples.slice(0, 3).join('；')}。連線被拒通常是 port／targetPort 寫錯`)
  const canaryNames = canary.map((p: any) => p.metadata.name)
  const hit = Object.keys(r.instances).filter(n => canaryNames.includes(n))
  assert.deepEqual(hit, [], `有 ${hit.map(n => r.instances[n]).join('')} 個請求打到了 cafe-api-canary 的 Pod：selector 只寫 app.kubernetes.io/name 會挑到同名的其他 Deployment，要把 app.kubernetes.io/instance: main 也寫上`)
  const mine = pods.map((p: any) => p.metadata.name)
  const used = Object.keys(r.instances).filter(n => mine.includes(n))
  assert(used.length >= 2, `200 個新連線只打到 ${used.length} 個 Pod（${JSON.stringify(r.instances)}）：Service 應該把連線分給 3 個 Pod`)
})
