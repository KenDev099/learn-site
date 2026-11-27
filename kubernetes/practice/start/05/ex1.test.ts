// 練習 1：ex1/gateway.yaml（入口）與 ex1/route.yaml（路由）：cafe.test 的 /products、/orders → cafe-api，其他 → web
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeconform, nsName, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { describeConds, gatewayUrl, get, instance, show, waitGateway, waitRoutes } from './gw.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(5, 1)
let staticOk = false, applied = false

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('gateway.yaml 與 route.yaml 通過 kubeconform，欄位照要求', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'gateway.yaml'), join(dir, 'route.yaml')])
  assert(v.ok, `kubeconform 沒通過，照訊息修正（常見原因：欄位放錯層、apiVersion 不是 gateway.networking.k8s.io/v1）：\n${v.message}`)
  const gws = readYaml(dir, 'gateway.yaml').filter(d => d.kind === 'Gateway')
  assert.equal(gws.length, 1, 'gateway.yaml 裡要剛好一個 Gateway')
  const gw = gws[0]
  assert.equal(gw.metadata?.name, 'cafe-gw', 'Gateway 的名稱要是 cafe-gw')
  assert.equal(gw.spec.gatewayClassName, 'cloud-provider-kind', 'gatewayClassName 要是 cloud-provider-kind（kubectl get gatewayclass 看得到的那個）')
  const l = (gw.spec.listeners ?? []).find((x: any) => x.protocol === 'HTTP' && x.port === 80)
  assert(l, 'listeners 裡要有一個 protocol: HTTP、port: 80 的 listener')
  assert.equal(l.allowedRoutes?.namespaces?.from, 'Same',
    `listener 的 allowedRoutes.namespaces.from 要明確寫 Same（現在是 ${l.allowedRoutes?.namespaces?.from ?? '沒寫'}）：寫 All 等於任何 namespace 的 Route 都能來搶 cafe.test`)
  const routes = readYaml(dir, 'route.yaml').filter(d => d.kind === 'HTTPRoute')
  assert(routes.length >= 1, 'route.yaml 裡要有 HTTPRoute')
  for (const r of routes) {
    assert((r.spec.parentRefs ?? []).some((p: any) => p.name === 'cafe-gw'), `HTTPRoute ${r.metadata?.name} 的 parentRefs 要指到 cafe-gw`)
    assert.deepEqual(r.spec.hostnames, ['cafe.test'], `HTTPRoute ${r.metadata?.name} 要寫 hostnames: [cafe.test]：沒寫的話任何網域的請求都會進來`)
  }
  staticOk = true
})

test('套用到 k8s-05-ex1 後 Gateway Programmed、HTTPRoute Accepted 與 ResolvedRefs 都是 True', { timeout: 300_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app=cafe-api', 1, 180_000)
  await waitPodsReady(ns, 'app=web', 1, 120_000)
  await waitGateway(ns, 'cafe-gw')
  for (const r of await waitRoutes(ns)) {
    assert.equal(r.conditions.Accepted?.status, 'True', `HTTPRoute ${r.name} 沒有被 Gateway 接受：${describeConds(r.conditions)}`)
    assert.equal(r.conditions.ResolvedRefs?.status, 'True',
      `HTTPRoute ${r.name} 的 backendRefs 有找不到的東西（BackendNotFound 通常是 Service 名稱打錯）：${describeConds(r.conditions)}`)
  }
  applied = true
})

test('從 Mac 經 Gateway：cafe.test 的 /products、/orders/42 到 cafe-api，/about 到 web，other.test 是 404', { timeout: 240_000 }, async () => {
  assert(applied, '先讓上一項（套用與 status）通過')
  const base = gatewayUrl(ns, 'cafe-gw')
  // 控制器更新 Envoy 要幾秒：先等 / 這條規則生效
  await waitFor(async () => instance(await get(base, 'cafe.test', '/about')).startsWith('web-'), 90_000,
    `${base}/about（Host: cafe.test）一直沒有送到 web`, 2000)
  const about = await get(base, 'cafe.test', '/about')
  assert.equal(JSON.parse(about.body).name, 'web', `/about 要由 web 回應：${show(about)}`)
  const products = await get(base, 'cafe.test', '/products')
  assert(products.status === 200 && instance(products).startsWith('cafe-api-'),
    `/products 要由 cafe-api 回 200（Service port 寫錯時 Envoy 連不上後端）：${show(products)}`)
  const order = await get(base, 'cafe.test', '/orders/42')
  assert(instance(order).startsWith('cafe-api-'),
    `/orders/42 要送到 cafe-api（cafe-api 回 404 找不到訂單沒關係），實際是 ${show(order)}：/orders 要用 PathPrefix，Exact 只符合剛好 /orders`)
  const other = await get(base, 'other.test', '/products')
  assert(other.status === 404 && !instance(other),
    `Host: other.test 應該由 Gateway 直接回 404，實際是 ${show(other)}：HTTPRoute 要寫 hostnames`)
})
