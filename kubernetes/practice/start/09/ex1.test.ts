// 練習 1：4 個副本在持續流量下從 v1 換到 v2：0 錯誤，可用的 Pod 永遠不少於 4 個
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeAsync, nsName, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { readDeployment, readyPods, resolveRolling, rolloutStatus, trafficDuring, watchAvailable } from './lib.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(9, 1)
const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('有 readinessProbe、strategy 讓可用的 Pod 不少於 4、minReadySeconds 5', { timeout: 30_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert.equal(dep.spec.replicas, 4, 'replicas 維持 4')
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1（測試會自己換成 v2）')
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready',
    '要有 readinessProbe（HTTP GET /health/ready，第 7 課）：沒有它，容器一啟動就算 Ready，滾動更新會把流量送進還在啟動的 Pod，也會太早關掉舊 Pod')
  assert((c.readinessProbe.periodSeconds ?? 10) <= 5, 'readinessProbe 的 periodSeconds 不超過 5，新 Pod 才能早點開始接流量')
  const r = resolveRolling(dep)
  assert.equal(r.type, 'RollingUpdate', 'strategy.type 要是 RollingUpdate：Recreate 會先把 4 個舊 Pod 全部關掉再建新的，中間完全沒有 Pod 可以服務')
  assert(dep.spec.strategy?.rollingUpdate, '寫出 strategy.rollingUpdate（maxSurge、maxUnavailable），不要依賴預設的 25%')
  assert.equal(r.unavailable, 0, `maxUnavailable 換算後是 ${r.unavailable} 個：可用的 Pod 會掉到 ${4 - r.unavailable}，要設成 0 才不會少於 4`)
  assert(r.surge >= 1, 'maxUnavailable 是 0 時 maxSurge 至少要 1，不然既不能多開、也不能少，更新無法進行')
  assert.equal(dep.spec.minReadySeconds, 5, 'spec.minReadySeconds 設 5：新 Pod Ready 後要穩定 5 秒才算可用，剛啟動就崩潰的版本不會一路換下去')
  staticOk = true
})

test('每秒 10 個請求下把映像換成 v2：0 錯誤、availableReplicas 全程 ≥ 4、最後 4 個 Pod 都是 v2', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  await rolloutStatus(ns)
  await waitPodsReady(ns, SELECTOR, 4, 120_000)
  const watch = watchAvailable(ns)
  let t
  try {
    t = await trafficDuring([`http://cafe-api.${ns}.svc.cluster.local/version`], 10, async () => {
      const s = await kubeAsync(['set', 'image', '-n', ns, 'deployment/cafe-api', 'api=learn-k8s/cafe-api:v2'])
      assert.equal(s.code, 0, `測試執行 kubectl set image 失敗：${s.stderr}`)
      const r = await kubeAsync(['rollout', 'status', '-n', ns, 'deployment/cafe-api', '--timeout=300s'])
      assert.equal(r.code, 0, `換成 v2 沒有在 300 秒內完成：${r.stderr || r.stdout}`)
    })
  } finally { watch.stop() }
  const min = Math.min(...watch.values)
  assert(watch.values.length > 0, '沒有記錄到 availableReplicas（kubectl get -w 沒有輸出）')
  assert(min >= 4, `更新期間 availableReplicas 最低掉到 ${min}（記錄：${watch.values.join(' → ')}）：maxUnavailable 要是 0`)
  assert(t.load.statuses['200'] > 0, '沒有任何成功的請求')
  assert.equal(t.load.errors, 0, `更新期間 ${t.load.requests} 個請求有 ${t.load.errors} 個失敗：${t.load.errorSamples.join('；')}`)
  const images = readyPods(ns, SELECTOR).map((p: any) => p.spec.containers[0].image)
  assert.deepEqual(images, Array(4).fill('learn-k8s/cafe-api:v2'), `結束時應該有 4 個 Ready 的 v2 Pod，現在是 ${images.join('、') || '沒有'}`)
})
