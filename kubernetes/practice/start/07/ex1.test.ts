// 練習 1：慢啟動（8 秒才聽 port）的 cafe-api 加上 readinessProbe，rollout restart 時持續的流量 0 錯誤
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeJson, nsName, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { SELECTOR, envOf, readDeployment, rollout, timing, trafficDuring } from './probes.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(7, 1)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('readinessProbe 是 HTTP GET /health/ready（port 3000），其他欄位沒被改', { timeout: 30_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  assert.equal(dep.spec.replicas, 2, 'replicas 維持 2')
  assert.equal(envOf(c, 'STARTUP_DELAY_MS'), '8000', 'STARTUP_DELAY_MS 維持 "8000"：這題就是要練慢啟動')
  assert.equal(envOf(c, 'REQUIRE_DB'), '0', 'REQUIRE_DB 維持 "0"')
  const r = c.readinessProbe
  assert(r, c.livenessProbe
    ? '只有 livenessProbe：liveness 決定「要不要重啟」，不決定「收不收流量」，Pod 一樣一啟動就算 Ready。要加的是 readinessProbe'
    : '還沒有 readinessProbe：沒有它，容器一啟動 Pod 就算 Ready，Service 馬上把流量送進還沒聽 port 的容器')
  assert(r.httpGet, 'readinessProbe 用 httpGet（cafe-api 有 HTTP 健康檢查端點）')
  assert.equal(r.httpGet.path, '/health/ready',
    r.httpGet.path === '/health/live' ? '/health/live 只回答「程序活著嗎」，排空中、資料庫斷線時一樣回 200；能不能接流量要問 /health/ready' : 'readinessProbe 的 path 要是 /health/ready')
  assert(r.httpGet.port === 3000 || r.httpGet.port === 'http', 'readinessProbe 的 port 是容器聽的 3000')
  const t = timing(r)
  assert(t.periodSeconds <= 5, `periodSeconds 是 ${t.periodSeconds}：啟動完要等下一次檢查才 Ready，間隔設 5 秒以內，滾動更新才不會拖很久`)
  staticOk = true
})

test('持續流量下 rollout restart：新 Pod 準備好才收流量，0 個錯誤', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  rollout(ns)
  const before = new Set((await waitPodsReady(ns, SELECTOR, 2, 120_000)).map(p => p.metadata.uid))
  const t = await trafficDuring([`http://cafe-api.${ns}.svc.cluster.local/version`], 10, async () => {
    const r = kube('rollout', 'restart', 'deployment/cafe-api', '-n', ns)
    assert.equal(r.code, 0, `測試執行 rollout restart 失敗：${r.stderr}`)
    rollout(ns)
  })
  const after = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items.filter((p: any) => !p.metadata.deletionTimestamp)
  assert(after.every((p: any) => !before.has(p.metadata.uid)), 'rollout restart 之後應該全部換成新的 Pod')
  assert.equal(t.errors, 0, `重啟期間 ${t.requests} 個請求有 ${t.errors} 個失敗：${t.errorSamples.join('；')}\n（ECONNREFUSED 代表流量送進了還沒聽 port 的 Pod）`)
})
