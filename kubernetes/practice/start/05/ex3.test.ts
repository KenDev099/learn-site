// 練習 3：setup.sh 產生憑證並建立 tls Secret；Gateway 加 HTTPS listener；HTTP 一律 301 轉址
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeJson, kubeconform, nsName, parseYaml, readYaml, requireCluster, runScript, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { describeConds, gatewayUrl, get, getTls, instance, show, waitGateway, waitRoutes } from './gw.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(5, 3)
let staticOk = false, setupOk = false, applied = false

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

const yamlFiles = () => readdirSync(dir).filter(f => /\.ya?ml$/.test(f))

test('YAML 檔裡沒有 Secret 與金鑰；HTTPS listener 與兩條路由照要求', { timeout: 30_000 }, () => {
  for (const f of yamlFiles()) {
    const text = readFileSync(join(dir, f), 'utf8')
    assert(!text.includes('PRIVATE KEY'), `${f} 裡出現 PRIVATE KEY：金鑰不能寫進 YAML，交給 setup.sh 用 kubectl create secret tls 建立`)
    const secrets = parseYaml(text, f).filter(d => d.kind === 'Secret')
    assert.equal(secrets.length, 0, `${f} 裡有 Secret：base64 不是加密，YAML 進了 git 金鑰就外流了。刪掉這個檔案，Secret 由 setup.sh 從檔案建立`)
  }
  const v = kubeconform([join(dir, 'gateway.yaml'), join(dir, 'routes.yaml')])
  assert(v.ok, `kubeconform 沒通過：\n${v.message}`)
  const gw = readYaml(dir, 'gateway.yaml').find(d => d.kind === 'Gateway' && d.metadata?.name === 'cafe-gw')
  assert(gw, 'gateway.yaml 裡要有 Gateway cafe-gw')
  const listeners = gw.spec.listeners ?? []
  const http = listeners.find((l: any) => l.protocol === 'HTTP' && l.port === 80)
  const https = listeners.find((l: any) => l.protocol === 'HTTPS' && l.port === 443)
  assert(http, '保留原本的 HTTP 80 listener：它負責把人轉到 HTTPS')
  assert(https, '要加一個 protocol: HTTPS、port: 443 的 listener')
  assert.equal(https.hostname, 'cafe.test', 'HTTPS listener 的 hostname 要是 cafe.test（跟憑證的 SAN 一致）')
  assert((https.tls?.mode ?? 'Terminate') === 'Terminate', 'tls.mode 要是 Terminate：在 Gateway 解密，後面用 HTTP 連 web')
  assert((https.tls?.certificateRefs ?? []).some((c: any) => c.name === 'cafe-tls'), 'HTTPS listener 的 tls.certificateRefs 要指到 Secret cafe-tls')
  const routes = readYaml(dir, 'routes.yaml').filter(d => d.kind === 'HTTPRoute')
  let redirects = 0
  for (const r of routes) {
    const sections = (r.spec.parentRefs ?? []).map((p: any) => p.sectionName)
    for (const rule of r.spec.rules ?? []) {
      if ((rule.backendRefs ?? []).length) {
        assert(sections.length && sections.every((s: string) => s === https.name),
          `HTTPRoute ${r.metadata?.name} 會送到後端，它的 parentRefs 要用 sectionName: ${https.name} 只掛在 HTTPS listener；沒寫 sectionName 等於 HTTP 也直接送到後端`)
      } else {
        const rd = (rule.filters ?? []).find((f: any) => f.type === 'RequestRedirect')?.requestRedirect
        assert(rd, `HTTPRoute ${r.metadata?.name} 有一個 rule 沒有後端也沒有轉址`)
        assert.equal(rd.scheme, 'https', '轉址要寫 scheme: https')
        assert.equal(rd.statusCode, 301, '轉址要寫 statusCode: 301（不寫是 302，暫時轉址）')
        assert(sections.length && sections.every((s: string) => s === http.name), `轉址的 HTTPRoute ${r.metadata?.name} 要用 sectionName: ${http.name} 只掛在 HTTP listener`)
        redirects++
      }
    }
  }
  assert(redirects >= 1, 'routes.yaml 要有一條掛在 HTTP listener、用 RequestRedirect 轉到 https 的路由')
  staticOk = true
})

test('setup.sh 產生憑證、建立 tls Secret cafe-tls，重複執行也成功，金鑰沒有出現在任何 YAML', { timeout: 120_000 }, () => {
  for (const round of [1, 2]) {
    const r = runScript(dir, 'setup.sh', [ns])
    assert.equal(r.code, 0, `第 ${round} 次執行 setup.sh 失敗（${r.code}）：${r.stderr.split('\n').slice(-5).join('\n')}${round === 2 ? '\nSecret 已經存在時要能更新：kubectl create secret … --dry-run=client -o yaml | kubectl apply -f -' : ''}`)
  }
  for (const f of ['ca.crt', 'server.crt', 'server.key']) assert(existsSync(join(dir, f)), `setup.sh 要在 ex3/ 產生 ${f}`)
  const secret = kubeJson('get', 'secret', 'cafe-tls', '-n', ns)
  assert.equal(secret.type, 'kubernetes.io/tls', 'Secret cafe-tls 的 type 要是 kubernetes.io/tls（kubectl create secret tls）')
  const crt = Buffer.from(secret.data['tls.crt'], 'base64').toString()
  assert.equal(crt.trim(), readFileSync(join(dir, 'server.crt'), 'utf8').trim(), 'Secret 裡的 tls.crt 要是這次產生的 server.crt')
  const key = readFileSync(join(dir, 'server.key'), 'utf8')
  const body = key.split('\n').filter(l => l && !l.startsWith('-----'))
  const b64 = Buffer.from(key).toString('base64')
  for (const f of yamlFiles()) {
    const text = readFileSync(join(dir, f), 'utf8')
    assert(!text.includes(b64.slice(0, 60)) && !body.some(l => text.includes(l)), `${f} 裡出現了 server.key 的內容：金鑰只能留在 server.key 與叢集的 Secret`)
  }
  setupOk = true
})

test('套用後 Gateway Programmed，兩個 listener 與 HTTPRoute 的 status 都正常', { timeout: 300_000 }, async () => {
  assert(staticOk && setupOk, '先讓前兩項通過，再套用到叢集')
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app=web', 1, 180_000)
  const gw = await waitGateway(ns, 'cafe-gw')
  for (const l of gw.status.listeners ?? []) {
    const bad = (l.conditions ?? []).filter((c: any) => c.status !== 'True' && ['Accepted', 'ResolvedRefs', 'Programmed'].includes(c.type))
    assert.deepEqual(bad.map((c: any) => `${c.type}=${c.status}（${c.reason}：${c.message}）`), [], `listener ${l.name} 有問題（InvalidCertificateRef 通常是 Secret 名稱不對或不是 tls 類型）`)
  }
  for (const r of await waitRoutes(ns)) {
    assert.equal(r.conditions.Accepted?.status, 'True', `HTTPRoute ${r.name} 沒有被接受（sectionName 要跟 listener 的 name 一樣）：${describeConds(r.conditions)}`)
    assert.equal(r.conditions.ResolvedRefs?.status, 'True', `HTTPRoute ${r.name} 的後端找不到：${describeConds(r.conditions)}`)
  }
  applied = true
})

test('從 Mac：https://cafe.test 用 ca.crt 驗證成功並送到 web；http://cafe.test 回 301 不送到後端', { timeout: 240_000 }, async () => {
  assert(applied, '先讓上一項通過')
  const ca = readFileSync(join(dir, 'ca.crt'), 'utf8')
  const tlsBase = gatewayUrl(ns, 'cafe-gw', 443)
  // Envoy 拿到新設定要幾秒：等到「有回應」或「憑證錯誤」為止
  const r = await waitFor(async () => {
    const x = await getTls(tlsBase, 'cafe.test', '/menu', ca)
    return x.status || /cert|altname|self.signed|issuer/i.test(x.error) ? x : null
  }, 90_000, `${tlsBase} 的 HTTPS 一直連不上`, 2000)
  assert.equal(r.error, '', `用 ca.crt 驗證 cafe.test 的憑證失敗：${r.error}\n（Hostname/IP does not match 表示 SAN 沒有 DNS:cafe.test）`)
  assert(r.status === 200 && instance(r).startsWith('web-'), `https://cafe.test/menu 要由 web 回 200：${show(r)}`)
  const base = gatewayUrl(ns, 'cafe-gw', 80)
  const h = await get(base, 'cafe.test', '/menu')
  assert(h.status === 301 && !instance(h), `http://cafe.test/menu 要由 Gateway 直接回 301，不能送到 web：${show(h)}`)
})
