// 練習 3：名稱帶版本的 immutable ConfigMap：v1 → v2 → rollout undo，設定跟著 Pod 範本一起回到 v1
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, kubeconform, nsName, requireCluster } from '../../helpers/k8s.ts'
import { container, readAll, rolloutStatus, waitConfigs } from './cafe.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(6, 3)
const DATA = {
  v1: { LOG_LEVEL: 'info', FEATURE_LOYALTY: 'false', APP_ENV: 'staging' },
  v2: { LOG_LEVEL: 'info', FEATURE_LOYALTY: 'true', APP_ENV: 'staging' },
}
let staticOk = false

before(() => { requireCluster(); freshNamespace(ns) })
after(() => deleteNamespace(ns))

test('v1/ 與 v2/ 各有一個名稱帶版本、immutable 的 ConfigMap，Deployment 引用同版本的那一個', { timeout: 30_000 }, () => {
  for (const ver of ['v1', 'v2'] as const) {
    const docs = readAll(join(dir, ver))
    const v = kubeconform([join(dir, ver)])
    assert(v.ok, `${ver}/ 的 kubeconform 沒通過：\n${v.message}`)
    const cms = docs.filter(d => d.kind === 'ConfigMap')
    assert.equal(cms.length, 1, `${ver}/ 裡要剛好一個 ConfigMap，現在有 ${cms.length} 個`)
    const name = `cafe-config-${ver}`
    assert.equal(cms[0].metadata?.name, name, `${ver}/ 的 ConfigMap 名稱要是 ${name}：每個版本一個新名稱，舊版本才會留在叢集上給回滾用`)
    assert.equal(cms[0].immutable, true, `${name} 要加 immutable: true（寫在最上層，跟 data 同一層）`)
    assert.deepEqual(cms[0].data, DATA[ver], `${name} 的 data 要是 ${JSON.stringify(DATA[ver])}`)
    const refs = (container(docs).envFrom ?? []).map((e: any) => e.configMapRef?.name).filter(Boolean)
    assert.deepEqual(refs, [name], `${ver}/deployment.yaml 的 envFrom 要引用 ${name}（現在是 ${refs.join('、') || '沒有'}）：名稱寫在 Pod 範本裡，換名稱就會觸發滾動更新，回滾時也一起回去`)
  }
  staticOk = true
})

test('套用 v1、再套用 v2，rollout undo 後 /config 回到 v1，cafe-config-v2 改不動', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  const loyalty = (want: string) => (cfg: any) => cfg.FEATURE_LOYALTY === want
  applyDir(join(dir, 'v1'), ns)
  rolloutStatus(ns)
  await waitConfigs(ns, 1, loyalty('false'), 90_000, '套用 v1 之後 /config 的 FEATURE_LOYALTY 應該是 "false"')

  applyDir(join(dir, 'v2'), ns)
  rolloutStatus(ns)
  await waitConfigs(ns, 1, loyalty('true'), 90_000, '套用 v2 之後 /config 的 FEATURE_LOYALTY 應該是 "true"：Deployment 有沒有改成引用 cafe-config-v2？')

  const u = kube('rollout', 'undo', 'deployment/cafe-api', '-n', ns)
  assert.equal(u.code, 0, `kubectl rollout undo 失敗：${u.stderr}`)
  rolloutStatus(ns)
  await waitConfigs(ns, 1, loyalty('false'), 90_000, 'rollout undo 之後 /config 應該回到 v1（FEATURE_LOYALTY "false"）')
  const ref = kubeJson('get', 'deployment', 'cafe-api', '-n', ns).spec.template.spec.containers[0].envFrom?.[0]?.configMapRef?.name
  assert.equal(ref, 'cafe-config-v1', `回滾後 Deployment 應該引用 cafe-config-v1，現在是 ${ref}`)

  const p = kube('patch', 'configmap', 'cafe-config-v2', '-n', ns, '--type=merge', '-p', '{"data":{"FEATURE_LOYALTY":"false"}}')
  assert.notEqual(p.code, 0, 'cafe-config-v2 竟然改得動：要加 immutable: true')
  assert.match(p.stderr, /immutable/i, `修改 cafe-config-v2 應該因為 immutable 被拒絕，實際訊息：${p.stderr}`)
})
