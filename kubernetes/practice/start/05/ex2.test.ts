// 練習 2：ex2/route.yaml 金絲雀：帶 X-Canary: 1 一律到 v2，其他 90:10 分給 v1、v2
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeconform, load, nsName, probe, readYaml, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { describeConds, waitGateway, waitRoutes } from './gw.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(5, 2)
let staticOk = false, ip = ''

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

const hasHeaderMatch = (rule: any) => (rule.matches ?? []).length > 0 && rule.matches.every((m: any) => (m.headers ?? []).length > 0)

test('route.yaml 只有 HTTPRoute、掛在 cafe-gw，沒有標頭的請求 v1:v2 的權重是 9:1', { timeout: 30_000 }, () => {
  const v = kubeconform([join(dir, 'route.yaml')])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  const docs = readYaml(dir, 'route.yaml')
  const kinds = docs.map(d => d.kind).filter(k => k !== 'HTTPRoute')
  assert.deepEqual(kinds, [], `route.yaml 只能有 HTTPRoute，不能有 ${kinds.join('、')}：入口是平台團隊的 cafe-gw，金絲雀只要改路由，不用（也不該）再開一個 Gateway`)
  for (const r of docs) {
    assert.deepEqual((r.spec.parentRefs ?? []).map((p: any) => p.name), ['cafe-gw'], `HTTPRoute ${r.metadata?.name} 的 parentRefs 只能指到 cafe-gw`)
    assert.deepEqual(r.spec.hostnames, ['cafe.test'], `HTTPRoute ${r.metadata?.name} 的 hostnames 要是 [cafe.test]`)
  }
  const plain = docs.flatMap(r => r.spec.rules ?? []).filter((rule: any) => !hasHeaderMatch(rule))
  const weighted = plain.find((rule: any) => (rule.backendRefs ?? []).length === 2)
  assert(weighted, '要有一個沒有標頭條件的 rule，backendRefs 同時列出 cafe-api-v1 和 cafe-api-v2')
  const w = Object.fromEntries(weighted.backendRefs.map((b: any) => [b.name, b.weight ?? 1]))
  assert('cafe-api-v1' in w && 'cafe-api-v2' in w, '分流的 rule 要列 cafe-api-v1 和 cafe-api-v2 兩個後端')
  assert.equal(w['cafe-api-v2'] / (w['cafe-api-v1'] + w['cafe-api-v2']), 0.1,
    `v2 要拿到 10%：weight 是相對比例，v1 90、v2 10（現在 v1 ${w['cafe-api-v1']}、v2 ${w['cafe-api-v2']}；沒寫 weight 預設是 1）`)
  staticOk = true
})

test('套用後 status 正常，帶 X-Canary: 1 的 30 個請求全部到 v2', { timeout: 300_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app=cafe-api-v1', 1, 180_000)
  await waitPodsReady(ns, 'app=cafe-api-v2', 1, 120_000)
  const gw = await waitGateway(ns, 'cafe-gw')
  for (const r of await waitRoutes(ns)) {
    assert.equal(r.conditions.Accepted?.status, 'True', `HTTPRoute ${r.name} 沒有被接受：${describeConds(r.conditions)}`)
    assert.equal(r.conditions.ResolvedRefs?.status, 'True', `HTTPRoute ${r.name} 的後端找不到：${describeConds(r.conditions)}`)
  }
  // 測試在叢集裡（k8s-tools 的 Pod）直接連 Gateway 的 IP，不經過 Mac 的 port 對應
  ip = (gw.status.addresses ?? []).find((a: any) => a.type === 'IPAddress' && !a.value.includes(':'))?.value ?? ''
  assert(ip, `Gateway 的 status.addresses 沒有 IPv4 位址：${JSON.stringify(gw.status.addresses)}`)
  await waitFor(() => probe(`http://${ip}/version`, { headers: { Host: 'cafe.test' } }).headers['x-instance'], 90_000,
    `經 Gateway ${ip} 打 cafe.test/version 一直沒有回應`, 2000)
  const r = await load(`http://${ip}/version`, { requests: 30, rps: 5, headers: { Host: 'cafe.test', 'X-Canary': '1' } })
  const v2 = Object.entries(r.instances).filter(([k]) => k.startsWith('cafe-api-v2-')).reduce((n, [, c]) => n + c, 0)
  assert.equal(v2, 30, `帶 X-Canary: 1 的 30 個請求應該全部到 v2，實際：${JSON.stringify(r.instances)}，錯誤 ${r.errors}：
標頭條件要自己一個 rule、只有 cafe-api-v2 一個後端。同一個 rule 裡的 matches 是「或」，跟權重放一起的話，帶標頭的請求也會被 90:10 分流`)
})

test('沒有標頭的 300 個請求，v2 約佔 10%（容許 4%～18%）', { timeout: 300_000 }, async () => {
  assert(ip, '先讓上一項通過')
  const r = await load(`http://${ip}/version`, { requests: 300, rps: 10, headers: { Host: 'cafe.test' } })
  assert(r.errors <= 15, `錯誤太多（${r.errors} 個）：${r.errorSamples.join('；')}。這台電腦太忙的話，等一下再跑一次`)
  const count = (p: string) => Object.entries(r.instances).filter(([k]) => k.startsWith(p)).reduce((n, [, c]) => n + c, 0)
  const v1 = count('cafe-api-v1-'), v2 = count('cafe-api-v2-')
  const ratio = v2 / (v1 + v2)
  assert(ratio >= 0.04 && ratio <= 0.18, `v2 佔 ${(ratio * 100).toFixed(1)}%（v1 ${v1}、v2 ${v2}），應該在 10% 左右：檢查兩個後端的 weight`)
})
