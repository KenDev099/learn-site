// 練習 3：用 ExternalName Service db 當固定名稱連外部資料庫；換資料庫只改 Service，不改應用設定
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kube, nsName, probe, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { containerOf, envValue, only, readManifest, startExternalPostgres, fresh } from './storage.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(11, 3)
const ext = nsName(11, 3, 'ext')
const next = nsName(11, 3, 'new')
const SELECTOR = 'app.kubernetes.io/name=cafe-api'
let staticOk = false

before(() => requireCluster())
after(() => { for (const n of [ns, ext, next]) deleteNamespace(n) })

test('service.yaml 是 ExternalName Service db（指到 ext-pg 的完整 DNS 名稱、沒有 selector），DATABASE_URL 的主機是 db', { timeout: 30_000 }, () => {
  const svc = only(readManifest(dir, 'service.yaml'), 'Service', 'db', 'service.yaml')
  assert.equal(svc.spec?.type, 'ExternalName', 'Service db 的 type 要是 ExternalName：它不轉送流量，只讓 DNS 把 db 回答成另一個名稱（CNAME）')
  const name: string = svc.spec.externalName ?? ''
  assert(!/^\d+(\.\d+){3}$/.test(name),
    'externalName 不能寫 IP：它會被當成「由數字組成的 DNS 名稱」做 CNAME，連不到那個 IP。要指到 IP 用沒有 selector 的 Service＋EndpointSlice')
  assert.equal(name, 'ext-pg.k8s-11-ex3-ext.svc.cluster.local',
    'externalName 寫完整的 DNS 名稱 ext-pg.k8s-11-ex3-ext.svc.cluster.local（<service>.<namespace>.svc.cluster.local）')
  assert.equal(svc.spec.selector, undefined, 'ExternalName 不要寫 selector：它不選 Pod，寫了也不會用，只會讓讀的人以為流量送到某些 Pod')

  const dep = only(readManifest(dir, 'deployment.yaml'), 'Deployment', 'cafe-api', 'deployment.yaml')
  const c = containerOf(dep, 'api')
  const raw = envValue(c, 'DATABASE_URL')
  assert(raw, '容器要有環境變數 DATABASE_URL（value 直接寫，密碼另外以檔案提供）')
  const url = new URL(raw)
  assert.equal(url.hostname, 'db', `DATABASE_URL 的主機要是 db，現在是 ${url.hostname}：應用只認固定名稱，換資料庫時改 Service db 就好`)
  assert.equal(url.port, '5432', 'DATABASE_URL 的 port 維持 5432')
  assert.notEqual(envValue(c, 'REQUIRE_DB'), '0', '不要設 REQUIRE_DB=0：這題要靠 /health/ready 證明連得到資料庫')
  staticOk = true
})

test('/health/ready 是 200；把 db 改指到另一個資料庫、舊的拿掉，rollout restart 後應用不改設定照樣 Ready', { timeout: 1_200_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  for (const n of [ns, ext, next]) await fresh(n)
  const pw = randomBytes(12).toString('hex')
  await Promise.all([startExternalPostgres(ext, pw), startExternalPostgres(next, pw)])
  const s = kube('create', 'secret', 'generic', 'cafe-db', '-n', ns, `--from-literal=password=${pw}`)
  if (s.code !== 0) throw new Error(`測試建立 Secret cafe-db 失敗：${s.stderr}`)

  applyDir(dir, ns)
  const [pod] = await waitPodsReady(ns, SELECTOR, 1, 300_000)
  const r = probe(`http://${pod.status.podIP}:3000/health/ready`)
  assert.equal(r.status, 200, `/health/ready 應該是 200（連得到資料庫），現在是 ${r.status || r.error}：${r.body}`)

  // 換資料庫：只改 Service db，並拿掉舊的，證明應用連的真的是新的那個
  const p = kube('patch', 'service', 'db', '-n', ns, '--type=merge', '-p', JSON.stringify({ spec: { externalName: `ext-pg.${next}.svc.cluster.local` } }))
  assert.equal(p.code, 0, `測試修改 Service db 失敗：${p.stderr}`)
  const d = kube('delete', 'service', 'ext-pg', '-n', ext, '--wait=true')
  assert.equal(d.code, 0, `測試刪除舊資料庫的 Service 失敗：${d.stderr}`)
  const rr = kube('rollout', 'restart', 'deployment/cafe-api', '-n', ns)
  assert.equal(rr.code, 0, `rollout restart 失敗：${rr.stderr}`)
  const st = kube('rollout', 'status', 'deployment/cafe-api', '-n', ns, '--timeout=180s')
  assert.equal(st.code, 0, `換到新資料庫後 cafe-api 沒有 Ready：DATABASE_URL 的主機要是 db，而不是舊資料庫的名稱\n${st.stderr || st.stdout}`)
  const [newPod] = await waitPodsReady(ns, SELECTOR, 1, 120_000)
  const r2 = probe(`http://${newPod.status.podIP}:3000/health/ready`)
  assert.equal(r2.status, 200, `換資料庫後 /health/ready 應該是 200，現在是 ${r2.status || r2.error}：${r2.body}`)
})
