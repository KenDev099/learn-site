// 練習 4：LoadBalancer Service 把 cafe-api 開到 Mac；curl.sh 每次都用 bin/url.mjs 查網址
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { KUBECONFIG, PRACTICE, applyDir, deleteNamespace, freshNamespace, isMutating, kube, kubeJson, kubeconform, nsName, readYaml, requireCluster, run, spyKubectl, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(4, 4)
const LEARN = join(PRACTICE, '..', '..')   // curl.sh 跟其他課程指令一樣，在 learn/ 執行

function service() {
  const svc = readYaml(dir, 'service-lb.yaml').find(d => d.kind === 'Service' && d.metadata?.name === 'cafe-api')
  assert(svc, 'service-lb.yaml 裡找不到名為 cafe-api 的 Service')
  return svc
}

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('service-lb.yaml 是 type: LoadBalancer、port 80', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'deployment.yaml'), join(dir, 'service-lb.yaml')])
  assert(v.ok, `kubeconform 檢查沒過：\n${v.message}`)
  const svc = service()
  assert.equal(svc.spec?.type, 'LoadBalancer', `type 要是 LoadBalancer（現在是 ${svc.spec?.type ?? '預設的 ClusterIP'}）：cloud-provider-kind 只替 LoadBalancer 建立 Mac 連得到的入口，NodePort 在 Mac 上連不到節點`)
  const ports = svc.spec?.ports ?? []
  assert.equal(ports.length, 1, 'Service 只要一個 port')
  assert.equal(ports[0].port, 80, 'port 要是 80')
})

test('從 Mac 執行 curl.sh 拿到 v1；Service 重建（主機 port 改變）後再跑一次也成功，而且沒有用 port-forward', { timeout: 600_000 }, async () => {
  assert.equal(service().spec?.type, 'LoadBalancer', 'type 要是 LoadBalancer')
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 2, 240_000)
  const spy = spyKubectl()
  try {
    const round = async (when: string) => {
      await waitFor(() => kubeJson('get', 'service', 'cafe-api', '-n', ns).status?.loadBalancer?.ingress?.length, 180_000,
        `${when}：Service cafe-api 一直沒有 EXTERNAL-IP：確認 type 是 LoadBalancer，以及 node kubernetes/practice/bin/cluster.mjs status 裡 cloud-provider-kind 在跑`, 3000)
      let last = ''
      await waitFor(() => {
        const r = run('bash', [join(dir, 'curl.sh')], { cwd: LEARN, env: { KUBECONFIG, ...spy.env }, timeout: 150_000 })
        last = `exit ${r.code}，stdout：${r.stdout.slice(0, 300)}，stderr：${r.stderr.slice(0, 300)}`
        const line = r.stdout.split('\n').find(l => l.trim().startsWith('{'))
        return r.code === 0 && line && JSON.parse(line).version === 'v1'
      }, 240_000, `${when}：curl.sh 沒有印出 /version 的 JSON（version 是 v1）。最後一次 ${last}。網址要每次用 node kubernetes/practice/bin/url.mjs k8s-04-ex4 cafe-api 查，不能寫死 port`, 5000)
    }
    await round('第一次')
    const del = kube('delete', 'service', 'cafe-api', '-n', ns, '--wait=true')
    assert.equal(del.code, 0, `測試刪除 Service 失敗：${del.stderr}`)
    applyDir(dir, ns)
    await round('Service 重建之後（Envoy 容器換了一個主機 port）')
    const bad = spy.calls().filter(isMutating)
    assert.deepEqual(bad.map(a => a.join(' ')), [], 'curl.sh 不能用 kubectl port-forward 之類的指令繞過：這題要練的是 LoadBalancer Service 的入口')
  } finally { spy.cleanup() }
})
