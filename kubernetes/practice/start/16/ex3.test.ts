// 練習 3：上線驗收。持續流量下 deploy.sh v2（含 expand migration）→ rollback.sh → 再 deploy.sh v2，0 錯誤；
// 再 drain 一個 worker 節點（只驅逐這一題的 Pod），0 錯誤、收據一張不少也不重複
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { deleteNamespace, kube, kubeAsync, kubeJson, nsName, readText, requireCluster, waitFor } from '../../helpers/k8s.ts'
import { API, DIR, devUp, find, helm, psql, readyPods, redis, render, script, sqlFiles, stripComments, trafficDuring } from './lib.ts'

const ns = nsName(16, 3)
const NODE = 'learn-k8s-worker2'
const MARK = 'learn.kubernetes/cordoned-by'
const URLS = [`http://cafe-api.${ns}.svc.cluster.local/products`, `http://cafe-api.${ns}.svc.cluster.local/version`]
let staticOk = false, rolloutOk = false

// 測試 cordon 節點前先做記號：上次中途被砍、節點還是 cordon 的話，下次只恢復自己 cordon 的節點
function restoreNode() {
  const node = kubeJson('get', 'node', NODE)
  if (node.metadata.annotations?.[MARK] !== ns) return
  kube('uncordon', NODE)
  kube('annotate', 'node', NODE, `${MARK}-`)
}
after(() => { try { restoreNode() } catch {} deleteNamespace(ns); deleteNamespace(`${ns}-data`) })

const apiImages = () => readyPods(kubeJson('get', 'pods', '-n', ns, '-l', API).items).map((p: any) => p.spec.containers[0].image).sort()

test('v2 的 migration 是 expand（只加可以是 NULL 的欄位、設 lock_timeout）；rollback.sh 用 helm rollback；PDB 在最少副本時仍允許驅逐', { timeout: 60_000 }, () => {
  const files = sqlFiles()
  assert(files.length >= 2, '在 migrate/sql/ 加上 v2 的 migration（例如 002_add_receipt_sent_at.sql），檔名排序決定執行順序')
  const sql = readText(join(DIR, 'migrate', 'sql'), files[files.length - 1]).replace(/--.*$/gm, '')
  assert.match(sql, /ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?receipt_sent_at\s+timestamptz/i, 'v2 的 migration 要在 orders 加 receipt_sent_at timestamptz 欄位')
  assert.doesNotMatch(sql, /\bRENAME\b|\bDROP\b/i, 'expand 階段不能改名或刪除欄位：v1 還在跑（回滾後也是），它查的欄位不見就壞了。改名要拆成 加新欄位 → 兩邊都寫 → 搬資料 → 下一版才刪（devops 課第 17 課）')
  assert.doesNotMatch(sql, /NOT\s+NULL/i, '新欄位不要 NOT NULL：v1 不認得這個欄位，INSERT 時不會給值，會被擋下')
  assert.match(sql, /lock_timeout/i, '在 ALTER TABLE 前 SET lock_timeout（例如 5s）：拿不到鎖就失敗，不要排隊把整張表的查詢一起卡住')

  const rb = stripComments(readText(DIR, 'rollback.sh'))
  assert.doesNotMatch(rb, /TODO：還沒寫/, 'rollback.sh 還是起始檔')
  assert.match(rb, /helm\s+rollback\s+cafe\b/, 'rollback.sh 用 helm rollback cafe：kubectl rollout undo 只改 Deployment，Helm 的紀錄、ConfigMap 都不會跟著回去')
  assert.match(rb, /--wait\b/, 'helm rollback 也要 --wait：等舊版 Pod 真的 Ready 才算回滾完成')
  assert.match(rb, /(-n|--namespace)[ =]+"?\$\{?NS/, 'rollback.sh 的 namespace 用 "$NS"（跟 deploy.sh 一樣可以覆寫）')

  const objs = render()
  const pdb = objs.find(o => o.kind === 'PodDisruptionBudget')
  const min = objs.find(o => o.kind === 'HorizontalPodAutoscaler')?.spec?.minReplicas ?? 2
  assert(pdb, '要有 PodDisruptionBudget（練習 1）')
  const allowed = pdb.spec.minAvailable !== undefined ? min - Number(pdb.spec.minAvailable) : Number(pdb.spec.maxUnavailable ?? 0)
  assert(allowed >= 1, `PDB 在 api 只有 ${min} 個副本時不允許任何驅逐（minAvailable ${pdb.spec.minAvailable}）：drain 會永遠卡住，平台團隊沒辦法升級節點。用 maxUnavailable: 1`)
  assert(find(objs, 'Deployment', 'cafe-api'))
  staticOk = true
})

test('持續流量下 deploy.sh v2 → rollback.sh → deploy.sh v2：每一步都成功、0 錯誤；回滾後資料庫保留新欄位，v2 的 migration 只套用一次', { timeout: 2_400_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再部署到叢集')
  requireCluster()
  restoreNode()
  await devUp(ns)
  const v1 = await script('deploy.sh', ns, ['v1'])
  assert.equal(v1.code, 0, `deploy.sh v1 失敗（先讓練習 2 通過）：${(v1.stderr || v1.stdout).split('\n').slice(-4).join('\n')}`)

  const steps: string[] = []
  const { load, value } = await trafficDuring(URLS, 10, async () => {
    const a = await script('deploy.sh', ns, ['v2'])
    if (a.code !== 0) return `deploy.sh v2 失敗：${(a.stderr || a.stdout).split('\n').slice(-4).join('\n')}（第二次部署時 NetworkPolicy 已經存在：migration Job 連得到 postgres 嗎？）`
    steps.push(`v2：${apiImages().join(',')}`)
    const b = await script('rollback.sh', ns)
    if (b.code !== 0) return `rollback.sh 失敗：${b.stderr || b.stdout}`
    steps.push(`rollback：${apiImages().join(',')}`)
    const c = await script('deploy.sh', ns, ['v2'])
    if (c.code !== 0) return `第二次 deploy.sh v2 失敗：${(c.stderr || c.stdout).split('\n').slice(-4).join('\n')}（同一版重新部署時，cafe-migrate-v2 這個 Job 已經存在）`
    steps.push(`v2 again：${apiImages().join(',')}`)
    return ''
  })
  assert.equal(value, '', value)
  assert.deepEqual(steps, [
    'v2：learn-k8s/cafe-api:v2,learn-k8s/cafe-api:v2',
    'rollback：learn-k8s/cafe-api:v1,learn-k8s/cafe-api:v1',
    'v2 again：learn-k8s/cafe-api:v2,learn-k8s/cafe-api:v2',
  ], '每一步結束時 Ready 的 api Pod 應該全部是那一版（--wait 讓腳本等到換完）')
  assert.equal(load.errors, 0, `部署與回滾期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
  const h = JSON.parse(helm('history', 'cafe', '-n', ns, '-o', 'json').stdout || '[]')
  assert.equal(h.length, 4, `helm history 應該有 4 個 revision（v1、v2、rollback、v2），現在有 ${h.length} 個`)
  assert.equal(psql(ns, "SELECT count(*) FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'receipt_sent_at'"), '1', 'orders 應該有 receipt_sent_at 欄位')
  assert.equal(psql(ns, "SELECT count(*) FROM schema_migrations"), String(sqlFiles().length), 'schema_migrations 的筆數應該等於 migration 檔的數量：每個檔只套用一次')
  rolloutOk = true
})

test(`持續流量下 drain ${NODE}（只驅逐這一題的 Pod）：成功、0 錯誤；同時送出的 20 張收據一張不少、不重複`, { timeout: 900_000 }, async () => {
  assert(rolloutOk, '先讓上一項（部署與回滾）通過')
  const before = Number(redis(ns, 'GET', 'receipts:sent') || 0)
  const ids = Array.from({ length: 20 }, (_, i) => `drain-${i}`)
  redis(ns, 'LPUSH', 'receipts:pending', ...ids)
  const mark = kube('annotate', 'node', NODE, `${MARK}=${ns}`, '--overwrite')
  assert.equal(mark.code, 0, `測試替節點加註記失敗：${mark.stderr}`)
  // --pod-selector 只驅逐這一題的 Pod，不打擾叢集裡其他練習；真正維護節點時不加
  const { load, value: d } = await trafficDuring(URLS, 10, () =>
    kubeAsync(['drain', NODE, '--pod-selector=app.kubernetes.io/instance=cafe', '--ignore-daemonsets', '--delete-emptydir-data', '--timeout=240s'], { timeout: 300_000 }))
  restoreNode()
  assert.equal(d.code, 0, `kubectl drain 沒有在 240 秒內完成：${(d.stderr || d.stdout).split('\n').slice(-3).join(' ')}\n（一直出現「Cannot evict pod as it would violate the pod's disruption budget」表示 PDB 不允許中斷）`)
  assert.equal(load.errors, 0, `drain 期間 ${load.requests} 個請求有 ${load.errors} 個失敗：${load.errorSamples.join('；')}`)
  await waitFor(() => Number(redis(ns, 'GET', 'receipts:sent')) - before >= 20 && redis(ns, 'LLEN', 'receipts:processing') === '0', 180_000,
    'drain 之後 180 秒內 20 張收據沒有全部寄出：worker 被驅逐時有沒有把手上的 job 做完？（terminationGracePeriodSeconds）')
  assert.equal(Number(redis(ns, 'GET', 'receipts:sent')) - before, 20, '寄出的收據數要剛好等於訂單數')
})
