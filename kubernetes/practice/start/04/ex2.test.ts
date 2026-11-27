// 練習 2：沒有流量的 Service：修好 selector 與 targetPort，並寫下用哪些指令查出來
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeJson, kubeconform, nsName, probe, readText, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(4, 2)

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('Service 還是 ClusterIP，manifest 通過 kubeconform', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'deployment.yaml'), join(dir, 'service.yaml')])
  assert(v.ok, `kubeconform 檢查沒過：\n${v.message}`)
  const svc = readYaml(dir, 'service.yaml').find(d => d.kind === 'Service')
  assert(svc, 'service.yaml 裡要有 Service cafe-api')
  assert(svc.spec?.type === undefined || svc.spec.type === 'ClusterIP',
    `不要把 type 改成 ${svc.spec?.type} 繞過問題：換類型不會修好 selector 和 targetPort，只會多開一個對外的入口`)
})

test('套用後 EndpointSlice 有 3 個 ready 的 Pod、port 是 3000，而且從叢集裡呼叫得到', { timeout: 300_000 }, async () => {
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 3, 240_000)
  await waitFor(() => {
    const slices = kubeJson('get', 'endpointslice', '-n', ns, '-l', 'kubernetes.io/service-name=cafe-api').items
    const ready = slices.flatMap((s: any) => s.endpoints ?? []).filter((e: any) => e.conditions?.ready)
    if (ready.length !== 3) throw new Error(`EndpointSlice 裡 ready 的 endpoint 有 ${ready.length} 個（要 3 個）：selector 跟 Pod 的 label 對不上`)
    const ports = slices.flatMap((s: any) => s.ports ?? []).map((p: any) => p.port)
    if (!ports.includes(3000)) throw new Error(`EndpointSlice 的 ports 是 ${JSON.stringify(ports)}（要 3000）：targetPort 找不到容器上同名的 port`)
    return true
  }, 60_000, 'Service cafe-api 後面沒有可用的 Pod：用 kubectl get endpointslice -n k8s-04-ex2 -l kubernetes.io/service-name=cafe-api 看 ENDPOINTS 與 PORTS')
  const r = await waitFor(() => {
    const p = probe('http://cafe-api.k8s-04-ex2/version')
    return p.status === 200 ? p : null
  }, 30_000, '從叢集裡呼叫 http://cafe-api.k8s-04-ex2/version 沒有回 200：Service 的 port 要是 80、targetPort 要指到容器實際在聽的 3000（名字 http）')
  assert.match(r.body, /"version":"v1"/, '回應應該是 cafe-api 的 /version')
})

test('diagnosis.md 寫下了查 EndpointSlice 與查 selector／label 的指令', { timeout: 10_000 }, () => {
  const text = readText(dir, 'diagnosis.md').toLowerCase()
  assert(/endpointslices?|endpoints?\b|\bep\b/.test(text), '寫下你用來看「Service 後面有哪些 Pod」的指令：kubectl get endpointslice …')
  assert(/describe|-o\s*yaml|--show-labels/.test(text), '寫下你用來對照 selector 和 Pod label／port 的指令：kubectl describe …、kubectl get … -o yaml 或 --show-labels')
})
