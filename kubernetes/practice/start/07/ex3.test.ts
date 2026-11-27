// 練習 3：資料庫中斷 40 秒：cafe-api 全部變 NotReady（不收流量）但不重啟，資料庫回來後自動 Ready
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, kubeIn, kubeJson, nsName, podSummary, requireCluster, sleep, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { SELECTOR, envOf, readDeployment, restarts, timing } from './probes.ts'

const dir = join(import.meta.dirname, 'ex3')
const ns = nsName(7, 3)
let staticOk = false

// 測試自己的 postgres（只要 TCP 連得上，cafe-api 的 /health/ready 就算資料庫正常）
const pg = { 'app.kubernetes.io/name': 'postgres' }
const postgres = JSON.stringify({
  apiVersion: 'v1', kind: 'List', items: [
    {
      apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'postgres' },
      spec: {
        replicas: 1, selector: { matchLabels: pg },
        template: {
          metadata: { labels: pg },
          spec: {
            terminationGracePeriodSeconds: 5,
            containers: [{
              name: 'postgres', image: 'postgres:18.6-alpine3.24', imagePullPolicy: 'IfNotPresent',
              env: [{ name: 'POSTGRES_HOST_AUTH_METHOD', value: 'trust' }, { name: 'POSTGRES_USER', value: 'cafe' }],
              ports: [{ containerPort: 5432 }],
              readinessProbe: { tcpSocket: { port: 5432 }, periodSeconds: 2 },
              resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '256Mi' } },
            }],
          },
        },
      },
    },
    { apiVersion: 'v1', kind: 'Service', metadata: { name: 'postgres' }, spec: { selector: pg, ports: [{ port: 5432 }] } },
  ],
})

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('livenessProbe 打 /health/live、readinessProbe 打 /health/ready', { timeout: 30_000 }, () => {
  const { c } = readDeployment(dir)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1', '映像維持 learn-k8s/cafe-api:v1')
  assert.equal(envOf(c, 'REQUIRE_DB'), undefined, '不要設 REQUIRE_DB：這題要 cafe-api 真的檢查資料庫')
  assert.equal(envOf(c, 'DATABASE_URL'), 'postgres://cafe@postgres:5432/cafe', 'DATABASE_URL 維持 postgres://cafe@postgres:5432/cafe')
  const r = c.readinessProbe, l = c.livenessProbe
  assert.equal(r?.httpGet?.path, '/health/ready', 'readinessProbe 要打 /health/ready：資料庫斷了，這個 Pod 就不該再收流量')
  assert(l, '保留 livenessProbe：程序卡住時還是要有人重啟它')
  assert.equal(l.httpGet?.path, '/health/live',
    'livenessProbe 只能檢查程序本身（/health/live）：打 /health/ready 的話資料庫一斷所有 Pod 一起重啟，調大 failureThreshold 只是延後同一件事')
  const lt = timing(l)
  assert(lt.periodSeconds * lt.failureThreshold <= 60, `livenessProbe 要 ${lt.periodSeconds * lt.failureThreshold} 秒才判定失敗：卡住的程序太久才被重啟，控制在 60 秒內`)
  const rt = timing(r)
  assert(rt.timeoutSeconds >= 3, `readinessProbe 的 timeoutSeconds 是 ${rt.timeoutSeconds}：/health/ready 連資料庫最多等 2 秒，probe 的逾時要比它長（至少 3）`)
  staticOk = true
})

test('postgres 停 40 秒：cafe-api 全部 NotReady 但不重啟，恢復後全部 Ready', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  const p = kubeIn(postgres, 'apply', '-n', ns, '-f', '-')
  assert.equal(p.code, 0, `測試建立 postgres 失敗：${p.stderr}`)
  await waitPodsReady(ns, 'app.kubernetes.io/name=postgres', 1, 150_000)
  applyDir(dir, ns)
  await waitPodsReady(ns, SELECTOR, 2, 150_000)

  const scale = (n: number) => {
    const s = kube('scale', 'deployment/postgres', '-n', ns, `--replicas=${n}`)
    assert.equal(s.code, 0, `測試調整 postgres 副本數失敗：${s.stderr}`)
  }
  scale(0)
  const down = Date.now()
  await waitFor(() => {
    const pods = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
    const ready = pods.filter((x: any) => x.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
    if (ready.length) throw new Error(podSummary(pods))
    return pods.length === 2
  }, 90_000, '資料庫停了，cafe-api 的 Pod 應該全部變成 NotReady（readinessProbe 打 /health/ready，periodSeconds × failureThreshold 不要太長）', 2000)
  await sleep(Math.max(0, 40_000 - (Date.now() - down)))
  const r1 = restarts(ns)
  assert.equal(r1.total, 0, `資料庫中斷期間 cafe-api 被重啟了：liveness 不能依賴資料庫\n${r1.summary}`)

  scale(1)
  await waitPodsReady(ns, SELECTOR, 2, 150_000)
  const r2 = restarts(ns)
  assert.equal(r2.total, 0, `cafe-api 被重啟過：\n${r2.summary}`)
})
