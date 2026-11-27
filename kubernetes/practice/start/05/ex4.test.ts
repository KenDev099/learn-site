// 練習 4：把 ex4/ingress.yaml.txt 的兩個 Ingress 改寫成 ex4/route.yaml 的 HTTPRoute
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeconform, nsName, probe, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { describeConds, waitGateway, waitRoutes } from './gw.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(5, 4)
let staticOk = false, ip = ''

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

// Ingress 的每一條規則應該變成的樣子：主機 比對方式 路徑 → 後端（rewrite 表示要把比對到的前綴換成 /）
const EXPECTED = [
  'api.cafe.test PathPrefix /orders → orders',
  'api.cafe.test Exact /healthz → orders',
  'www.cafe.test PathPrefix /menu → menu rewrite /',
  'www.cafe.test PathPrefix / → web',
]

function entries(routes: any[]): string[] {
  const out: string[] = []
  for (const r of routes) {
    const hosts: string[] = r.spec.hostnames ?? []
    assert(hosts.length, `HTTPRoute ${r.metadata?.name} 沒寫 hostnames：它的規則會套用到所有主機。一個 Ingress 的 host 對應一個 hostnames`)
    for (const rule of r.spec.rules ?? []) {
      const rw = (rule.filters ?? []).find((f: any) => f.type === 'URLRewrite')?.urlRewrite?.path
      const rewrite = rw ? ` rewrite ${rw.type === 'ReplacePrefixMatch' ? rw.replacePrefixMatch : rw.type + ' ' + rw.replaceFullPath}` : ''
      const backends = (rule.backendRefs ?? []).map((b: any) => b.name).join(',')
      for (const m of rule.matches?.length ? rule.matches : [{}]) {
        const p = m.path ?? { type: 'PathPrefix', value: '/' }
        for (const h of hosts) out.push(`${h} ${p.type ?? 'PathPrefix'} ${p.value ?? '/'} → ${backends}${rewrite}`)
      }
    }
  }
  return out.sort()
}

test('route.yaml 通過 kubeconform，跟 Ingress 的每一條規則一一對應（含 rewrite）', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'route.yaml')])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  const routes = readYaml(dir, 'route.yaml')
  assert(routes.length && routes.every(d => d.kind === 'HTTPRoute'), 'route.yaml 只放 HTTPRoute（入口用現成的 cafe-gw）')
  for (const r of routes) assert.deepEqual((r.spec.parentRefs ?? []).map((p: any) => p.name), ['cafe-gw'], `HTTPRoute ${r.metadata?.name} 的 parentRefs 要指到 cafe-gw`)
  const got = entries(routes)
  const missing = EXPECTED.filter(e => !got.includes(e)), extra = got.filter(e => !EXPECTED.includes(e))
  assert(!missing.length && !extra.length, `規則對不上。\n少了：\n  ${missing.join('\n  ') || '（無）'}\n多了或寫錯：\n  ${extra.join('\n  ') || '（無）'}
提示：Ingress 的 Prefix 是 PathPrefix、Exact 是 Exact；rewrite-target /$2 等於 URLRewrite 的 ReplacePrefixMatch，replacePrefixMatch: /`)
  staticOk = true
})

test('套用後 Gateway Programmed、HTTPRoute 的後端都找得到', { timeout: 300_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  for (const app of ['orders', 'menu', 'web']) await waitPodsReady(ns, `app=${app}`, 1, 180_000)
  const gw = await waitGateway(ns, 'cafe-gw')
  // 本機的 cloud-provider-kind 0.12.0 不支援 URLRewrite：含 URLRewrite 的 rule 會被丟掉（PartiallyInvalid），所以這裡只看 ResolvedRefs
  for (const r of await waitRoutes(ns))
    assert.equal(r.conditions.ResolvedRefs?.status, 'True', `HTTPRoute ${r.name} 的後端找不到：${describeConds(r.conditions)}`)
  ip = (gw.status.addresses ?? []).find((a: any) => a.type === 'IPAddress' && !a.value.includes(':'))?.value ?? ''
  assert(ip, `Gateway 的 status.addresses 沒有 IPv4 位址：${JSON.stringify(gw.status.addresses)}`)
})

test('同一組請求打 Gateway，送到的後端與後端收到的路徑都跟 Ingress 時一樣（/menu 除外）', { timeout: 240_000 }, async () => {
  assert(ip, '先讓上一項通過')
  const ask = (host: string, path: string) => {
    const r = probe(`http://${ip}${path}`, { headers: { Host: host } })
    let name = '', got = ''
    try { ({ name, path: got } = JSON.parse(r.body)) } catch {}
    return { status: r.status, name, path: got, text: r.status ? `${r.status} ${r.body.slice(0, 100)}` : r.error }
  }
  await waitFor(() => ask('www.cafe.test', '/about').name === 'web', 90_000, 'www.cafe.test/about 一直沒有送到 web', 2000)
  // [主機, 路徑, 預期的後端（空字串＝Gateway 回 404）, 後端收到的路徑]
  const table: [string, string, string, string][] = [
    ['api.cafe.test', '/orders/7', 'orders', '/orders/7'],
    ['api.cafe.test', '/healthz', 'orders', '/healthz'],
    ['api.cafe.test', '/healthz/deep', '', ''],
    ['api.cafe.test', '/about', '', ''],
    ['www.cafe.test', '/about', 'web', '/about'],
    ['shop.test', '/', '', ''],
  ]
  const wrong: string[] = []
  for (const [host, path, name, want] of table) {
    const r = ask(host, path)
    const ok = name ? r.name === name && r.path === want : r.status === 404 && !r.name
    if (!ok) wrong.push(`${host}${path}：應該${name ? `到 ${name}、路徑 ${want}` : '由 Gateway 回 404'}，實際 ${r.text}`)
  }
  assert.deepEqual(wrong, [], `有請求的去向跟 Ingress 不一樣：\n${wrong.join('\n')}`)
})
