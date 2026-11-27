// 練習 2：45 秒才聽 port 的 slow-start 映像：startupProbe 讓它能起來，livenessProbe 在卡住時很快重啟
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, nsName, probe, requireCluster, waitFor, waitPodsReady } from '../../helpers/k8s.ts'
import { SELECTOR, readDeployment, restarts, timing } from './probes.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(7, 2)
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('startupProbe 至少給 60 秒；livenessProbe 打 /health/live，卡住 20 秒內就判定失敗', { timeout: 30_000 }, () => {
  const { c } = readDeployment(dir)
  assert.equal(c.image, 'learn-k8s/cafe-api:slow-start', '映像維持 learn-k8s/cafe-api:slow-start')
  const l = c.livenessProbe
  assert(l, '要保留 livenessProbe：沒有它，程序卡住（event loop 不動）時沒有人會重啟它')
  assert.equal(l.httpGet?.path, '/health/live', 'livenessProbe 打 HTTP GET /health/live')
  const lt = timing(l)
  assert(lt.initialDelaySeconds <= 10,
    `livenessProbe 的 initialDelaySeconds 是 ${lt.initialDelaySeconds}：用拉長等待來撐過慢啟動，每次重啟都要白等，啟動卡住或啟動後很快卡住也要很久才發現。慢啟動交給 startupProbe`)
  assert(lt.periodSeconds * lt.failureThreshold <= 20,
    `livenessProbe 要 ${lt.periodSeconds} × ${lt.failureThreshold} = ${lt.periodSeconds * lt.failureThreshold} 秒才判定失敗，要在 20 秒以內`)
  const s = c.startupProbe
  assert(s, '還沒有 startupProbe：它成功一次之前 liveness 和 readiness 都不會開始，慢啟動的容器才不會被 liveness 殺掉')
  assert(s.httpGet?.path, 'startupProbe 用 httpGet 檢查（例如 /health/live）')
  const st = timing(s)
  const budget = st.initialDelaySeconds + st.periodSeconds * st.failureThreshold
  assert(budget >= 60, `startupProbe 最多只等 ${budget} 秒（initialDelaySeconds＋periodSeconds × failureThreshold），容器要 45 秒才聽 port，在忙碌的節點上更久：至少給 60 秒`)
  assert(st.periodSeconds <= 10, `startupProbe 的 periodSeconds 是 ${st.periodSeconds}：間隔太長，啟動完要多等一段才開始服務；用較短的間隔、較大的 failureThreshold`)
  staticOk = true
})

test('Pod 不重啟就 Ready；之後讓程序卡住，liveness 會重啟容器', { timeout: 420_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  freshNamespace(ns)
  applyDir(dir, ns)
  const [pod] = await waitPodsReady(ns, SELECTOR, 1, 180_000)
  const r0 = restarts(ns)
  assert.equal(r0.total, 0, `啟動期間容器被重啟了：startupProbe 給的時間不夠，或 liveness 在啟動期間就開始檢查\n${r0.summary}`)
  const h = probe(`http://${pod.status.podIP}:3000/debug/hang`, { method: 'POST' })
  assert.equal(h.status, 200, `測試呼叫 POST /debug/hang 失敗：${h.status || h.error}`)
  // 判定失敗（≤ 20 秒）後 kubelet 先送 SIGTERM；卡住的程序處理不了，要等寬限期（預設 30 秒）結束被 SIGKILL 才重啟
  await waitFor(() => restarts(ns).total >= 1, 120_000, 'event loop 卡住後，liveness 應該在 20 秒左右判定失敗，再過寬限期容器被重啟（restartCount 變成 1）', 2000)
})
