// 練習 2：NetworkPolicy：預設拒絕，只放行 DNS、k8s-tools → cafe-api、cafe-api → postgres／redis
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeJson, nsName, probe, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { FIXTURES, describe, readManifest, tcpFrom, waitDefaultSa } from './lib.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(12, 2)
const outside = nsName(12, 2, 'outside')
let staticOk = false, readyOk = false

before(() => requireCluster())
after(() => { deleteNamespace(ns); deleteNamespace(outside) })

const isEmpty = (sel: any) => sel != null && Object.keys(sel.matchLabels ?? {}).length === 0 && (sel.matchExpressions ?? []).length === 0

test('netpol.yaml：只有 NetworkPolicy，有 podSelector: {} 的預設拒絕（Ingress 與 Egress），postgres、redis 只收 cafe-api', { timeout: 30_000 }, () => {
  const docs = readManifest(dir, 'netpol.yaml')
  const other = docs.filter(d => d.kind !== 'NetworkPolicy')
  assert.equal(other.length, 0, `netpol.yaml 只放 NetworkPolicy，不要放 ${describe(other)}`)
  const deny = docs.find(d => isEmpty(d.spec?.podSelector) && !(d.spec?.ingress?.length) && !(d.spec?.egress?.length))
  assert(deny, '要有一條預設拒絕：podSelector: {}（選到每個 Pod），而且沒有 ingress、egress 規則')
  const types = deny.spec.policyTypes ?? []
  assert(types.includes('Ingress') && types.includes('Egress'),
    `預設拒絕 ${deny.metadata.name} 的 policyTypes 要同時有 Ingress 和 Egress，現在是 [${types.join(', ')}]：只擋進來的話，被入侵的 Pod 還是能往外連任何地方`)
  // postgres、redis 的 ingress 只能來自 cafe-api：就算之後有人放寬了別的 Pod 的 egress，資料庫這一端仍然擋得住
  const NAME = 'app.kubernetes.io/name'
  const selects = (np: any, app: string) => isEmpty(np.spec?.podSelector) ||
    (np.spec?.podSelector?.matchLabels?.[NAME] === app && Object.keys(np.spec.podSelector.matchLabels).length === 1 && !np.spec.podSelector.matchExpressions?.length)
  const onlyApi = (peer: any) => !peer.namespaceSelector && !peer.ipBlock &&
    peer.podSelector?.matchLabels?.[NAME] === 'cafe-api' && Object.keys(peer.podSelector.matchLabels).length === 1
  for (const app of ['postgres', 'redis']) {
    const policies = docs.filter(d => selects(d, app) && d.spec?.ingress?.length)
    assert(policies.length > 0, `要有一條選到 ${app} 的 NetworkPolicy，允許 cafe-api 連進來`)
    for (const np of policies) for (const rule of np.spec.ingress)
      assert(rule.from?.length && rule.from.every(onlyApi),
        `${np.metadata.name} 讓 ${app} 收到 cafe-api 以外的連線：ingress 的 from 只寫 podSelector 選 ${NAME}: cafe-api（podSelector: {} 是整個 namespace，沒寫 from 是所有來源）`)
  }
  staticOk = true
})

test('cafe-api Ready（DNS、postgres、redis 都連得上），k8s-tools 的 probe 連得到 cafe-api', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(outside)
  freshNamespace(ns)
  applyDir(join(FIXTURES, 'ex2-outside.yaml'), outside)
  await waitDefaultSa(ns)
  applyDir(join(FIXTURES, 'ex2-app.yaml'), ns)
  applyDir(dir, ns)
  await waitPodsReady(outside, 'app.kubernetes.io/name=echo', 1, 180_000)
  await waitPodsReady(ns, 'app.kubernetes.io/name in (postgres,redis)', 2, 180_000)
  try {
    await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 1, 120_000)
  } catch (e) {
    throw new Error(`cafe-api 一直沒有 Ready：它的 /health/ready 要連得上 postgres:5432 和 redis:6379。` +
      `名稱查不到（DNS）或被擋住都會這樣，用 kubectl logs -n ${ns} deploy/cafe-api 看 EAI_AGAIN／ETIMEDOUT。\n${(e as Error).message}`)
  }
  // 叢集很忙時 /health/ready 偶爾會逾時，給它幾次機會
  await waitFor(() => {
    const r = probe(`http://cafe-api.${ns}:3000/health/ready`)
    if (r.status !== 200) throw new Error(`現在是 ${r.status || r.error}`)
    return true
  }, 60_000, '從 k8s-tools 的 probe 連 cafe-api:3000 應該回 200：cafe-api 要允許 namespace k8s-tools 連進來', 3000)
  readyOk = true
})

test('attacker 連不到 postgres、redis、cafe-api 與別的 namespace；cafe-api 也連不到別的 namespace', { timeout: 120_000 }, async () => {
  assert(readyOk, '先讓上一項（cafe-api Ready）通過')
  const echo = `echo.${outside}.svc.cluster.local:80`
  const api = kubeJson('get', 'pods', '-n', ns, '-l', 'app.kubernetes.io/name=cafe-api').items[0].metadata.name
  const checks: [string, string[]][] = [
    ['attacker', [`postgres:5432`, `redis:6379`, `cafe-api:3000`, echo]],
    [api, [echo]],
  ]
  // NetworkPolicy 套用後要幾秒才生效：在 60 秒內等到全部被擋（逾時或拒絕）
  await waitFor(() => {
    const open = checks.flatMap(([pod, targets]) => Object.entries(tcpFrom(ns, pod, targets))
      .filter(([, v]) => v === 'open').map(([t]) => `${pod === 'attacker' ? 'attacker' : 'cafe-api'} → ${t}`))
    if (open.length) throw new Error(`還連得到：${open.join('、')}`)
    return true
  }, 60_000, '被入侵的 Pod 不該連到任何東西，cafe-api 也只能連 postgres 和 redis：檢查預設拒絕，以及 postgres、redis 的 ingress 只選 cafe-api', 3000)
})
