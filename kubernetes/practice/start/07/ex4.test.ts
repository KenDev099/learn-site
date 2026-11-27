// 練習 4：DRAIN_MS=0 的 cafe-api 靠 preStop sleep＋足夠的寬限期＋readiness，在負載下滾動重啟兩次 0 錯誤
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kube, nsName, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { SELECTOR, envOf, readDeployment, rollout, trafficDuring } from './probes.ts'

const dir = join(import.meta.dirname, 'ex4')
const ns = nsName(7, 4)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('有 readiness、preStop sleep ≥ 3 秒、寬限期 ≥ preStop＋4＋2，DRAIN_MS 維持 0', { timeout: 30_000 }, () => {
  const { dep, c } = readDeployment(dir)
  assert.equal(c.image, 'learn-k8s/cafe-api:v1',
    '映像維持 learn-k8s/cafe-api:v1（no-sigterm 版本會忽略 SIGTERM，每個 Pod 都要等到寬限期結束才被 SIGKILL）')
  assert.equal(envOf(c, 'DRAIN_MS'), '0', 'DRAIN_MS 維持 "0"：不能靠應用程式自己等，要用 preStop 讓 Kubernetes 先等一下')
  assert.equal(c.readinessProbe?.httpGet?.path, '/health/ready', '要有 readinessProbe（HTTP GET /health/ready）')
  const pre = c.lifecycle?.preStop
  assert(pre, '還沒有 lifecycle.preStop：Pod 開始終止時，從端點移除和送 SIGTERM 是同時發生的，要先等幾秒讓轉送規則更新')
  assert(pre.sleep, 'preStop 用 sleep 動作（sleep: { seconds: N }）：不需要容器裡有 sleep 指令，也不會多一個 shell 程序')
  const sec = pre.sleep.seconds
  assert(Number.isInteger(sec) && sec >= 3, `preStop 的 sleep 是 ${sec} 秒：至少 3 秒，讓 kube-proxy 有時間把這個 Pod 拿掉`)
  const grace = dep.spec.template.spec.terminationGracePeriodSeconds
  assert(grace !== undefined, '寫出 spec.template.spec.terminationGracePeriodSeconds：算過的值寫在 manifest 裡，下一個人才知道它容得下多久')
  assert(grace >= sec + 4 + 2, `terminationGracePeriodSeconds 是 ${grace}：寬限期從 preStop 開始就在倒數，要 ≥ preStop ${sec}＋最長請求 4＋關閉 2 = ${sec + 6} 秒，不然 4 秒的請求做到一半就被 SIGKILL`)
  staticOk = true
})

test('每秒 20 個請求（含 4 秒的長請求）下滾動重啟兩次：0 個錯誤、0 個連線重置', { timeout: 600_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  rollout(ns)
  await waitPodsReady(ns, SELECTOR, 2, 120_000)
  const base = `http://cafe-api.${ns}.svc.cluster.local`
  const t = await trafficDuring([`${base}/version`, `${base}/version`, `${base}/version`, `${base}/slow?ms=4000`], 20, async () => {
    for (let i = 0; i < 2; i++) {
      const r = kube('rollout', 'restart', 'deployment/cafe-api', '-n', ns)
      assert.equal(r.code, 0, `測試執行 rollout restart 失敗：${r.stderr}`)
      rollout(ns)
    }
  })
  assert(t.statuses['200'] > 0, '沒有任何成功的請求')
  assert.equal(t.errors, 0, `重啟期間 ${t.requests} 個請求有 ${t.errors} 個失敗：${t.errorSamples.join('；')}\n（ECONNREFUSED：Pod 已經不接連線，轉送規則還沒更新；ECONNRESET：請求做到一半被 SIGKILL）`)
})
