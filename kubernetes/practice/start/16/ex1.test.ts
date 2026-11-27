// 練習 1：chart 的上線檢查（靜態）。helm lint、kubeconform，再逐項檢查上線標準；最後用 server dry-run 確認符合 Pod Security restricted
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, freshNamespace, kubeIn, nsName, readText, requireCluster } from '../../helpers/k8s.ts'
import {
  CHART, DNS, NAME, POSTGRES, REDIS, containers, egressAllowed, find, ingressAllowed, isDefaultDeny, mib, migrateJob, podSpec, render, renderText, workloads,
} from './lib.ts'

const ns = nsName(16, 1)
let objs: any[] = []
const passed = new Set<string>()
const TITLE: Record<string, string> = { render: 'helm lint 與 kubeconform', api: 'api', worker: 'worker 與資源', hpa: 'HPA、PDB 與分散', sa: 'ServiceAccount 與機密', netpol: 'NetworkPolicy' }
const need = (...names: string[]) => { for (const n of names) assert(passed.has(n), `先讓「${TITLE[n]}」那一項通過`) }

after(() => deleteNamespace(ns))

test('helm lint 通過；helm template（values-local.yaml）通過 kubeconform', { timeout: 60_000 }, () => {
  objs = render()
  passed.add('render')
})

test('api：不輸出 replicas（交給 HPA）、startup／readiness／liveness 三種 probe 且 liveness 不打 /health/ready、preStop sleep 與足夠的寬限期', { timeout: 10_000 }, () => {
  need('render')
  const dep = find(objs, 'Deployment', 'cafe-api')
  assert(dep.spec.replicas === undefined, `api 的 Deployment 輸出了 replicas: ${dep.spec.replicas}：開了 HPA 就不要輸出，否則每次 helm upgrade 都把 HPA 擴出來的 Pod 縮回這個數字（第 13 課）`)
  const c = podSpec(dep).containers?.find((x: any) => x.name === 'api')
  assert(c, 'api 的 Deployment 要有名為 api 的容器')
  assert(c.startupProbe, 'api 要有 startupProbe：啟動期間由它把關，通過之後 liveness 才開始算（第 7 課）')
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready', 'readinessProbe 打 /health/ready：資料庫或 Redis 連不上時先不收流量')
  const live = c.livenessProbe?.httpGet?.path
  assert(live, 'api 要有 livenessProbe（httpGet）')
  assert.notEqual(live, '/health/ready', 'livenessProbe 不能打 /health/ready：資料庫一斷，所有 Pod 會被一起重啟，事情只會更糟。liveness 打 /health/live（只問程序還活著嗎）')
  const pre = c.lifecycle?.preStop?.sleep?.seconds
  assert(typeof pre === 'number' && pre >= 3, 'api 要有 lifecycle.preStop.sleep.seconds（至少 3 秒）：等其他節點更新轉送規則再開始關機（第 7 課）')
  const grace = podSpec(dep).terminationGracePeriodSeconds ?? 30
  assert(grace >= pre + 15, `api 的寬限期 ${grace} 秒不夠：寬限期從 preStop 就開始倒數，要 ≥ preStop ${pre} 秒＋ DRAIN_MS 5 秒＋最長的請求（至少再留 10 秒）`)
  passed.add('api')
})

test('worker 寬限期 ≥ 60 秒；每個容器有 CPU／記憶體 requests 與記憶體 limits；映像有明確 tag、IfNotPresent', { timeout: 10_000 }, () => {
  need('render')
  const w = find(objs, 'Deployment', 'cafe-worker')
  const grace = podSpec(w).terminationGracePeriodSeconds
  assert(grace !== undefined && grace >= 60, `worker 的 terminationGracePeriodSeconds 是 ${grace ?? '預設 30'}：寄收據最久要 45 秒，收到 SIGTERM 後要能把手上的 job 做完，設 60 以上`)
  for (const o of workloads(objs)) for (const c of containers(o)) {
    const where = `${o.kind} ${o.metadata.name} 的容器 ${c.name}`
    assert(c.resources?.requests?.cpu && c.resources?.requests?.memory, `${where} 要有 resources.requests 的 cpu 與 memory：排程器靠它決定放哪裡，HPA 靠它算使用率（第 8 課）`)
    assert(mib(c.resources?.limits?.memory) > 0, `${where} 要有 resources.limits.memory：沒有上限的容器可以吃光節點的記憶體`)
    const image = String(c.image ?? '')
    assert(/:[\w.-]+$/.test(image) && !/:latest$/.test(image), `${where} 的映像 ${image} 要有明確的 tag（不能沒寫或用 latest）：同一個 tag 每次都要是同一個東西，回滾才有意義`)
    assert.equal(c.imagePullPolicy, 'IfNotPresent', `${where} 要寫 imagePullPolicy: IfNotPresent`)
  }
  passed.add('worker')
})

test('HPA（min 2、max 4、縮容穩定視窗 ≤ 60 秒）、PDB 不會卡住 drain、api 用 topologySpreadConstraints 分散（nodeTaintsPolicy: Honor）', { timeout: 10_000 }, () => {
  need('render')
  const hpa = objs.find(o => o.kind === 'HorizontalPodAutoscaler')
  assert(hpa, 'templates/hpa.yaml 還沒輸出 HorizontalPodAutoscaler（autoscaling/v2）')
  assert.deepEqual([hpa.spec.scaleTargetRef?.kind, hpa.spec.scaleTargetRef?.name], ['Deployment', 'cafe-api'], 'HPA 的 scaleTargetRef 要指到 Deployment cafe-api')
  assert.equal(hpa.spec.minReplicas, 2, 'HPA minReplicas 2：任何時候至少兩個 Pod，壞一個還有一個')
  assert.equal(hpa.spec.maxReplicas, 4, 'HPA maxReplicas 4：尖峰是平常的 3 倍，再留一點餘裕；本機叢集只有兩個 worker，不要更多')
  const win = hpa.spec.behavior?.scaleDown?.stabilizationWindowSeconds
  assert(typeof win === 'number' && win <= 60, `values-local.yaml 的縮容穩定視窗要 ≤ 60 秒（現在是 ${win ?? '預設 300'}）：用 values 控制，正式環境維持 300`)
  const pdb = objs.find(o => o.kind === 'PodDisruptionBudget')
  assert(pdb, 'templates/pdb.yaml 還沒輸出 PodDisruptionBudget（policy/v1）')
  const sel = pdb.spec.selector?.matchLabels ?? {}
  const apiLabels = find(objs, 'Deployment', 'cafe-api').spec.template.metadata.labels
  assert(Object.keys(sel).length && Object.entries(sel).every(([k, v]) => apiLabels[k] === v) && sel['app.kubernetes.io/component'] === 'api',
    'PDB 的 selector.matchLabels 要選到 api 的 Pod（含 app.kubernetes.io/component: api），不要選到 worker')
  assert(pdb.spec.minAvailable === undefined, `PDB 不要用 minAvailable（現在是 ${pdb.spec.minAvailable}）：等於最小副本數時一個都不能驅逐，drain 永遠卡住。用 maxUnavailable: 1`)
  assert.equal(pdb.spec.maxUnavailable, 1, 'PDB 用 maxUnavailable: 1')
  const spread = podSpec(find(objs, 'Deployment', 'cafe-api')).topologySpreadConstraints ?? []
  const host = spread.find((s: any) => s.topologyKey === 'kubernetes.io/hostname')
  assert(host, 'api 的 Pod 範本要有 topologyKey: kubernetes.io/hostname 的 topologySpreadConstraints：兩個副本放在同一台節點，節點一掛就全掛')
  assert.equal(host.maxSkew, 1, '分散規則 maxSkew 設 1')
  assert.equal(host.nodeTaintsPolicy, 'Honor', '分散規則要寫 nodeTaintsPolicy: Honor：不然 control-plane 與 drain 中的節點會被算成「0 個 Pod 的節點」，新 Pod 一直 Pending（第 9 課）')
  assert(Object.entries(host.labelSelector?.matchLabels ?? {}).length && Object.entries(host.labelSelector.matchLabels).every(([k, v]) => apiLabels[k] === v),
    '分散規則的 labelSelector 要選到 api 的 Pod')
  passed.add('hpa')
})

test('專屬 ServiceAccount 且不掛 token；ConfigMap 改了會換 Pod（checksum）；機密只從 Secret cafe-secrets 來，values 檔沒有機密', { timeout: 10_000 }, () => {
  need('render')
  const sas = objs.filter(o => o.kind === 'ServiceAccount')
  assert(sas.length, 'templates/serviceaccount.yaml 還沒輸出 ServiceAccount')
  for (const name of ['cafe-api', 'cafe-worker']) {
    const spec = podSpec(find(objs, 'Deployment', name))
    const sa = sas.find(s => s.metadata.name === spec.serviceAccountName)
    assert(sa, `${name} 要用 chart 裡的 ServiceAccount（serviceAccountName），不要用 namespace 的 default`)
    assert(spec.automountServiceAccountToken === false || (spec.automountServiceAccountToken === undefined && sa.automountServiceAccountToken === false),
      `${name} 不呼叫 Kubernetes API，不要掛 ServiceAccount token：在 ServiceAccount 或 Pod 設 automountServiceAccountToken: false`)
    const ann = find(objs, 'Deployment', name).spec.template.metadata.annotations ?? {}
    assert(Object.keys(ann).some(k => /^checksum\//.test(k)), `${name} 的 Pod 範本要有 checksum/config annotation：ConfigMap 改了 Pod 才會換新（第 13 課）`)
  }
  for (const f of ['values.yaml', 'values-local.yaml']) {
    const text = readText(CHART, f).replace(/#.*$/gm, '')
    assert.doesNotMatch(text, /DATABASE_URL|REDIS_URL|PASSWORD|postgres(ql)?:\/\/|redis:\/\//i, `chart/${f} 裡有連線字串或密碼：機密不進 chart（chart 會進 git、會被 helm get values 印出來），從 Secret cafe-secrets 用 secretKeyRef 取`)
  }
  for (const cm of objs.filter(o => o.kind === 'ConfigMap'))
    for (const k of Object.keys(cm.data ?? {})) assert(!/URL|PASSWORD|SECRET/i.test(k), `ConfigMap ${cm.metadata.name} 有 ${k}：機密放 Secret`)
  const env = (name: string, c: string) => (podSpec(find(objs, 'Deployment', name)).containers.find((x: any) => x.name === c)?.env ?? [])
  for (const [dep, c, keys] of [['cafe-api', 'api', ['DATABASE_URL', 'REDIS_URL']], ['cafe-worker', 'worker', ['REDIS_URL']]] as const)
    for (const k of keys) {
      const ref = env(dep, c).find((e: any) => e.name === k)?.valueFrom?.secretKeyRef
      assert(ref?.name === 'cafe-secrets' && ref.key === k, `${dep} 的環境變數 ${k} 要用 secretKeyRef 從 Secret cafe-secrets 的 ${k} 取值`)
    }
  passed.add('sa')
})

test('NetworkPolicy：預設拒絕；所有 Pod 能查 DNS；api 收 3000、連 postgres 與 redis；worker 只連 redis；migration Job 只連 postgres', { timeout: 10_000 }, () => {
  need('render')
  const nps = objs.filter(o => o.kind === 'NetworkPolicy')
  assert(nps.some(isDefaultDeny), '要有一條預設拒絕：podSelector: {}、policyTypes 同時有 Ingress 與 Egress、沒有任何規則（第 12 課）')
  const labels = (name: string) => find(objs, 'Deployment', name).spec.template.metadata.labels
  const migrate = migrateJob().spec.template.metadata.labels
  for (const [who, l] of [['api', labels('cafe-api')], ['worker', labels('cafe-worker')], ['migration Job', migrate]] as const)
    assert(egressAllowed(nps, l, DNS), `${who} 查不到 DNS：預設拒絕連 DNS 也擋，要放行到 kube-system 的 k8s-app: kube-dns，UDP 與 TCP 53`)
  assert(ingressAllowed(nps, labels('cafe-api'), 3000), 'api 要能收到 3000 port 的連線（Gateway 與叢集內的呼叫，不限來源）')
  assert(egressAllowed(nps, labels('cafe-api'), POSTGRES), 'api 要能連到 postgres 的 5432：資料庫在另一個 namespace，peer 要同時寫 namespaceSelector 與 podSelector（app.kubernetes.io/name: postgres）')
  assert(egressAllowed(nps, labels('cafe-api'), REDIS), 'api 要能連到 redis 的 6379（另一個 namespace，app.kubernetes.io/name: redis）')
  assert(egressAllowed(nps, labels('cafe-worker'), REDIS), 'worker 要能連到 redis 的 6379')
  assert(!egressAllowed(nps, labels('cafe-worker'), POSTGRES), 'worker 不需要資料庫，不要讓它連 postgres：最小權限')
  assert(egressAllowed(nps, migrate, POSTGRES), 'migration Job（app.kubernetes.io/component: migrate）要能連 postgres：第一次部署時規則還不存在所以會過，第二次部署就卡住')
  assert(!egressAllowed(nps, migrate, REDIS), 'migration Job 不需要 Redis，不要放行')
  passed.add('netpol')
})

test('Pod Security restricted：把 chart 與 migration Job 用 server dry-run 送到 enforce／warn=restricted 的 namespace，沒有違規', { timeout: 180_000 }, () => {
  need('api', 'worker', 'hpa', 'sa', 'netpol')
  requireCluster()
  freshNamespace(ns, { 'pod-security.kubernetes.io/enforce': 'restricted', 'pod-security.kubernetes.io/warn': 'restricted' })
  const text = renderText(CHART, ns) + '\n---\n' + JSON.stringify(migrateJob())
  const r = kubeIn(text, 'apply', '--dry-run=server', '-n', ns, '-f', '-')
  assert.equal(r.code, 0, `server dry-run 失敗：${r.stderr}`)
  assert.doesNotMatch(r.stderr, /would violate PodSecurity/, `有 Pod 不符合 restricted：\n${r.stderr.split('\n').filter(l => /PodSecurity/.test(l)).join('\n')}\n每個 Pod 要 runAsNonRoot、seccompProfile RuntimeDefault，每個容器要 allowPrivilegeEscalation: false、capabilities.drop: [ALL]（第 12 課）`)
})
