// 練習 3：跨 namespace 用 DNS 名稱連線：k8s-04-ex3-api 的 cafe-api 透過 MENU_URL 呼叫 k8s-04-ex3-menu 的 menu
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, kubeconform, nsName, probe, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

const dir = join(import.meta.dirname, 'ex3')
const menuNs = nsName(4, 3, 'menu')
const apiNs = nsName(4, 3, 'api')
const yamls = (sub: string) => readdirSync(join(dir, sub)).filter(f => /\.ya?ml$/.test(f)).flatMap(f => readYaml(join(dir, sub), f))

function menuUrl(): string {
  const dep = yamls('api').find(d => d.kind === 'Deployment' && d.metadata?.name === 'cafe-api')
  assert(dep, 'api/deployment.yaml 裡要有 Deployment cafe-api')
  const env = dep.spec?.template?.spec?.containers?.[0]?.env ?? []
  const url = env.find((e: any) => e.name === 'MENU_URL')?.value ?? ''
  assert(url, 'api/deployment.yaml 的環境變數 MENU_URL 還是空的：填入菜單服務的網址')
  return url
}

before(() => { requireCluster(); freshNamespace(menuNs); freshNamespace(apiNs) })
after(() => { deleteNamespace(menuNs); deleteNamespace(apiNs) })

test('MENU_URL 用 Service 的 DNS 名稱、帶上 menu 的 namespace，菜單服務有自己的 Service', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'menu'), join(dir, 'api')])
  assert(v.ok, `kubeconform 檢查沒過：\n${v.message}`)
  const menuSvc = yamls('menu').find(d => d.kind === 'Service' && d.metadata?.name === 'menu')
  assert(menuSvc, 'menu/service.yaml 裡要有名為 menu 的 Service')
  const strays = yamls('api').filter(d => d.metadata?.name === 'menu' || d.spec?.template?.metadata?.labels?.['app.kubernetes.io/name'] === 'menu')
  assert.deepEqual(strays.map(d => d.kind), [], '菜單服務屬於另一個團隊，要留在 menu/（namespace k8s-04-ex3-menu），不要複製一份到 api/ 讓短名稱剛好查得到')
  const url = menuUrl()
  assert(!/\b\d{1,3}(\.\d{1,3}){3}\b/.test(url), `MENU_URL 不能寫 IP（${url}）：Service 重建後 ClusterIP 會變，Pod 重建後 Pod IP 也會變，要用 DNS 名稱`)
  let host = ''
  try { host = new URL(url).hostname } catch { assert.fail(`MENU_URL 不是合法的網址：${url}（要有 http:// 開頭）`) }
  assert(/^menu\.k8s-04-ex3-menu(\.svc(\.cluster\.local)?)?\.?$/.test(host),
    `MENU_URL 的主機是 ${host}：cafe-api 在 k8s-04-ex3-api，只寫 menu 會在自己的 namespace 裡找；跨 namespace 要寫 menu.k8s-04-ex3-menu（或完整的 menu.k8s-04-ex3-menu.svc.cluster.local）`)
})

test('cafe-api 的 /menu-proxy 拿到菜單；menu 的 Service 刪掉重建（ClusterIP 改變）之後還是拿得到', { timeout: 360_000 }, async () => {
  menuUrl()
  applyDir(join(dir, 'menu'), menuNs)
  applyDir(join(dir, 'api'), apiNs)
  await waitPodsReady(menuNs, 'app.kubernetes.io/name=menu', 1, 240_000)
  await waitPodsReady(apiNs, 'app.kubernetes.io/name=cafe-api', 1, 240_000)
  const fetchMenu = (when: string) => waitFor(() => {
    const p = probe('http://cafe-api.k8s-04-ex3-api/menu-proxy', { timeoutSec: 8 })
    if (p.status === 200 && Array.isArray(JSON.parse(p.body).menu) && JSON.parse(p.body).menu.length === 6) return true
    throw new Error(`HTTP ${p.status} ${p.body || p.error}`)
  }, 60_000, `${when}：cafe-api 的 GET /menu-proxy 沒有拿到菜單。回應裡的 error 是 cafe-api 連 MENU_URL 時的錯誤，ENOTFOUND 代表名稱查不到（namespace 寫錯或沒寫），ECONNREFUSED 代表 port 不對`, 2000)

  await fetchMenu('第一次呼叫')
  const oldIp = kubeJson('get', 'service', 'menu', '-n', menuNs).spec.clusterIP
  const del = kube('delete', 'service', 'menu', '-n', menuNs, '--wait=true')
  assert.equal(del.code, 0, `測試刪除 Service menu 失敗：${del.stderr}`)
  applyDir(join(dir, 'menu'), menuNs)
  const newIp = kubeJson('get', 'service', 'menu', '-n', menuNs).spec.clusterIP
  await fetchMenu(`Service menu 重建之後（ClusterIP ${oldIp} → ${newIp}）`)
})
