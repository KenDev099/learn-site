// 練習 1：每個 Pod 要 4 CPU、8Gi 而排不上（Pending）→ 改成量過的 requests／limits，3 個 Pod 都排得上
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, nsName, readText, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { bytes, cpuMilli, memUnitProblem, readDeployment } from './res.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(8, 1)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('notes.md 記下 Pending 的原因（FailedScheduling 的訊息）', { timeout: 10_000 }, () => {
  const notes = readText(dir, 'notes.md')
  assert.match(notes, /Insufficient memory/i,
    'notes.md 裡還沒有排程器的訊息：先套用起始的 deployment.yaml，用 kubectl describe pod 看 Events 的 FailedScheduling，把「0/3 nodes are available: …」那一行貼進來（裡面會寫哪一種資源不夠）')
})

test('requests cpu 100m／memory 96Mi、limits memory 192Mi，replicas 維持 3', { timeout: 10_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert.equal(dep.spec.replicas, 3,
    `replicas 是 ${dep.spec.replicas}：要維持 3。減少副本不會讓 8Gi 的 Pod 排得上，問題在每個 Pod 要的資源`)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  const req = c.resources?.requests, lim = c.resources?.limits
  assert(req?.cpu !== undefined && req?.memory !== undefined,
    '容器要有 resources.requests 的 cpu 與 memory：把 resources 整段刪掉會變成 BestEffort，排程器以為它不用資源、節點記憶體不足時它第一個被驅逐')
  assert(lim?.memory !== undefined, '要有 resources.limits.memory：沒有記憶體上限，一個洩漏的 Pod 可以把整個節點的記憶體用光')
  for (const [f, q] of [['requests.memory', req.memory], ['limits.memory', lim.memory]] as const) {
    const p = memUnitProblem(f, q)
    assert(!p, p ?? '')
  }
  assert.equal(cpuMilli(req.cpu), 100, `requests.cpu 是 ${req.cpu}：改成 100m（0.1 顆 CPU）`)
  assert.equal(bytes(req.memory), bytes('96Mi'), `requests.memory 是 ${req.memory}：改成 96Mi`)
  assert.equal(bytes(lim.memory), bytes('192Mi'), `limits.memory 是 ${lim.memory}：改成 192Mi`)
  assert(bytes(lim.memory) >= bytes(req.memory), 'limits.memory 不能比 requests.memory 小')
  staticOk = true
})

test('套用到叢集：3 個 Pod 都排上節點並 Ready', { timeout: 180_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  await waitPodsReady(ns, 'app.kubernetes.io/name=cafe-api', 3, 150_000)
})
