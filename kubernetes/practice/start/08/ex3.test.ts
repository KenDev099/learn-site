// 練習 3：namespace 的防護：LimitRange 給沒寫 resources 的容器預設值，ResourceQuota 限制整個 namespace 的總量
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeIn, kubeJson, nsName, requireCluster, waitFor } from '../../helpers/k8s.ts'
import { bytes, cpuMilli, readDocs } from './res.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(8, 3)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('LimitRange：預設 requests cpu 50m／memory 64Mi、預設 limits memory 128Mi', { timeout: 10_000 }, () => {
  const lr = readDocs(dir, 'guardrails.yaml').find(d => d.kind === 'LimitRange')
  assert(lr, 'guardrails.yaml 裡要有一個 LimitRange')
  const item = lr.spec?.limits?.find((l: any) => l.type === 'Container')
  assert(item, 'LimitRange 的 spec.limits 要有一項 type: Container（預設值是套在每個容器上的）')
  assert(item.defaultRequest, '還沒有 defaultRequest：它是「沒寫 requests 時」的預設值')
  assert.equal(cpuMilli(item.defaultRequest.cpu), 50, `defaultRequest.cpu 是 ${item.defaultRequest.cpu}：要 50m`)
  assert.equal(bytes(item.defaultRequest.memory), bytes('64Mi'), `defaultRequest.memory 是 ${item.defaultRequest.memory}：要 64Mi`)
  assert(item.default?.memory !== undefined,
    '還沒有 default.memory：defaultRequest 只補 requests，limits 要另外用 default 補，不然沒寫 resources 的容器還是沒有記憶體上限')
  assert.equal(bytes(item.default.memory), bytes('128Mi'), `default.memory 是 ${item.default.memory}：要 128Mi`)
})

test('ResourceQuota：requests.cpu 1、requests.memory 1Gi、pods 10', { timeout: 10_000 }, () => {
  const q = readDocs(dir, 'guardrails.yaml').find(d => d.kind === 'ResourceQuota')
  assert(q, 'guardrails.yaml 裡要有一個 ResourceQuota')
  const hard = q.spec?.hard ?? {}
  assert(!('limits.cpu' in hard) || 'requests.cpu' in hard,
    '題目要限制的是 requests.cpu（排程保留的總量），不是 limits.cpu。而且只寫 limits.cpu 時，每個 Pod 都必須寫 CPU limit，沒寫的會被拒絕建立')
  assert.equal(cpuMilli(hard['requests.cpu']), 1000, `requests.cpu 是 ${hard['requests.cpu']}：要 "1"（或 1000m）`)
  assert.equal(bytes(hard['requests.memory']), bytes('1Gi'), `requests.memory 是 ${hard['requests.memory']}：要 1Gi`)
  assert.equal(Number(hard.pods), 10, `pods 是 ${hard.pods}：要 "10"`)
  staticOk = true
})

// 不會被排上節點的 Pod（nodeSelector 對不到任何節點）：只經過 admission，不佔叢集資源
const pod = (name: string, resources?: object) => JSON.stringify({
  apiVersion: 'v1', kind: 'Pod', metadata: { name },
  spec: {
    nodeSelector: { 'learn-k8s/none': 'true' },
    containers: [{ name: 'app', image: 'busybox:1.38.0', imagePullPolicy: 'IfNotPresent', command: ['sleep', '3600'], ...(resources ? { resources } : {}) }],
  },
})

test('叢集：沒寫 resources 的 Pod 拿到預設值；超過 CPU 總量或第 11 個 Pod 被拒絕', { timeout: 180_000 }, async () => {
  assert(staticOk, '先讓上面兩項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  // ResourceQuota 剛建立時，quota 控制器還沒算出 status；等它算好再建 Pod，用量才會從 0 開始算對
  await waitFor(() => kubeJson('get', 'resourcequota', '-n', ns).items[0]?.status?.hard, 60_000, 'ResourceQuota 一直沒有 status（quota 控制器沒算出用量）')

  const c1 = kubeIn(pod('plain'), 'create', '-n', ns, '-f', '-')
  assert.equal(c1.code, 0, `建立沒寫 resources 的 Pod 失敗：${c1.stderr}`)
  const r = kubeJson('get', 'pod', 'plain', '-n', ns).spec.containers[0].resources
  assert.equal(cpuMilli(r.requests?.cpu), 50, `沒寫 resources 的 Pod 拿到的 requests.cpu 是 ${r.requests?.cpu}，應該是 50m`)
  assert.equal(bytes(r.requests?.memory), bytes('64Mi'), `沒寫 resources 的 Pod 拿到的 requests.memory 是 ${r.requests?.memory}，應該是 64Mi`)
  assert.equal(bytes(r.limits?.memory), bytes('128Mi'), `沒寫 resources 的 Pod 拿到的 limits.memory 是 ${r.limits?.memory}，應該是 128Mi`)

  const c2 = kubeIn(pod('huge', { requests: { cpu: '2', memory: '64Mi' }, limits: { memory: '128Mi' } }), 'create', '-n', ns, '-f', '-')
  assert.notEqual(c2.code, 0, '要求 2 顆 CPU 的 Pod 竟然建立成功了：requests.cpu 的總量上限應該是 1')
  assert.match(c2.stderr, /exceeded quota/, `要求 2 顆 CPU 的 Pod 應該因為 exceeded quota 被拒絕，實際訊息：${c2.stderr}`)

  const many = JSON.stringify({
    apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'many' },
    spec: { replicas: 12, selector: { matchLabels: { app: 'many' } }, template: { metadata: { labels: { app: 'many' } }, spec: JSON.parse(pod('x')).spec } },
  })
  const c3 = kubeIn(many, 'create', '-n', ns, '-f', '-')
  assert.equal(c3.code, 0, `建立 Deployment 失敗：${c3.stderr}`)
  const msg = await waitFor(() => kubeJson('get', 'events', '-n', ns, '--field-selector', 'reason=FailedCreate').items
    .map((e: any) => e.message).find((m: string) => /exceeded quota/.test(m)), 90_000,
  '開 12 個副本時，ReplicaSet 應該在第 10 個 Pod 之後出現 FailedCreate（exceeded quota）事件')
  assert.match(msg, /pods/, `ReplicaSet 被拒絕的原因應該是 Pod 數量（pods），實際：${msg}`)
  const count = kubeJson('get', 'pods', '-n', ns).items.length
  assert.equal(count, 10, `namespace 裡有 ${count} 個 Pod，應該剛好被擋在 10 個`)
})
