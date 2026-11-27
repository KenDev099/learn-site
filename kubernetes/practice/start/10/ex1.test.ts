// 練習 1：migration Job：restartPolicy Never、backoffLimit 1、activeDeadlineSeconds 120、ttlSecondsAfterFinished 600、DATABASE_URL 從 Secret 讀；
// 套用後成功建立 orders 表，換個名字再跑一次也成功、schema 不變
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyDir, deleteNamespace, freshNamespace, kubeIn, nsName, requireCluster } from '../../helpers/k8s.ts'
import { buildMigrateImages, columns, jobLogs, readOne, sql, startPostgres, trueConditions, waitJobDone } from './jobs.ts'

const dir = join(import.meta.dirname, 'ex1')
const ns = nsName(10, 1)
let job: any

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('migrate-job.yaml：restartPolicy Never、backoffLimit 1、activeDeadlineSeconds 120、ttlSecondsAfterFinished 600，DATABASE_URL 從 Secret 讀', { timeout: 30_000 }, () => {
  const j = readOne(dir, 'migrate-job.yaml', 'Job', 'migrate-v1')
  const pod = j.spec?.template?.spec ?? {}
  const c = pod.containers?.find((x: any) => x.name === 'migrate')
  assert(c && pod.containers.length === 1, 'Pod 裡只有一個名為 migrate 的容器')
  assert.equal(c.image, 'learn-k8s/cafe-migrate:v1', '映像維持 learn-k8s/cafe-migrate:v1')
  assert.equal(pod.restartPolicy, 'Never', !pod.restartPolicy || pod.restartPolicy === 'Always'
    ? 'Job 的 Pod 不能用 Always（沒寫就是 Always），API server 會直接拒絕：Job 要的是「跑完就停」。寫 restartPolicy: Never'
    : 'OnFailure 會在同一個 Pod 裡原地重啟容器，失敗的那次 log 會被下一次蓋掉；用 Never，每次重試都是新的 Pod，失敗的 Pod 留著讓你看 log')
  const s = j.spec
  assert.equal(s.backoffLimit, 1, s.backoffLimit === undefined
    ? '沒寫 backoffLimit 就是預設的 6：migration 的錯誤（SQL 寫錯、拿不到鎖）通常不會自己好，重試 6 次只是讓部署多卡好幾分鐘。寫 backoffLimit: 1'
    : `backoffLimit 要是 1，現在是 ${s.backoffLimit}`)
  assert.equal(s.activeDeadlineSeconds, 120, 'activeDeadlineSeconds 要是 120：卡住的 migration（例如一直等鎖）最多跑 2 分鐘就判定失敗')
  assert.equal(s.ttlSecondsAfterFinished, 600, 'ttlSecondsAfterFinished 要是 600：結束 10 分鐘後自動刪掉，留時間看 log，又不會越積越多')
  const env = c.env?.find((e: any) => e.name === 'DATABASE_URL')
  const fromEnvFrom = c.envFrom?.some((e: any) => e.secretRef?.name === 'db-migrator')
  assert(env || fromEnvFrom, '容器要有環境變數 DATABASE_URL，從 Secret db-migrator 讀')
  if (env) {
    assert.equal(env.value, undefined, '不要把連線字串（含密碼）明文寫在 env.value：manifest 會進 git、kubectl get job -o yaml 誰都看得到。用 valueFrom.secretKeyRef')
    assert.equal(env.valueFrom?.secretKeyRef?.name, 'db-migrator', 'DATABASE_URL 用 valueFrom.secretKeyRef 讀 Secret db-migrator')
    assert.equal(env.valueFrom.secretKeyRef.key, 'DATABASE_URL', 'secretKeyRef 的 key 是 DATABASE_URL')
  }
  job = j
})

test('套用後 120 秒內 Complete、建立 orders 表；換個名字再跑一次也成功，schema 和紀錄都不變', { timeout: 600_000 }, async () => {
  assert(job, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  buildMigrateImages()
  freshNamespace(ns)
  await startPostgres(ns, ['db-migrator'])

  const t0 = Date.now()
  applyDir(join(dir, 'migrate-job.yaml'), ns)
  const done = await waitJobDone(ns, 'migrate-v1', 180_000)
  assert(trueConditions(done).includes('Complete'), `migrate-v1 失敗了，log：\n${jobLogs(ns, 'migrate-v1')}`)
  const secs = Math.round((Date.now() - t0) / 1000)
  assert(secs <= 150, `migrate-v1 花了 ${secs} 秒才完成，應該在 120 秒內`)
  assert.equal(sql(ns, "SELECT to_regclass('public.orders') IS NOT NULL"), 't', 'migration 完成後資料庫裡應該有 orders 表')
  const schema = columns(ns)
  const applied = sql(ns, "SELECT string_agg(name, ',' ORDER BY name) FROM schema_migrations")
  assert.equal(applied, '001_create_orders.sql', 'schema_migrations 應該記錄 001_create_orders.sql')

  // Job 的 Pod 範本建立後不能改、名稱也不能重複：要再跑一次就用新名稱
  const again = { ...job, metadata: { name: 'migrate-v1-again' } }
  const c = kubeIn(JSON.stringify(again), 'create', '-n', ns, '-f', '-')
  assert.equal(c.code, 0, `測試用新名稱再建立一次 Job 失敗：${c.stderr}`)
  const done2 = await waitJobDone(ns, 'migrate-v1-again', 180_000)
  assert(trueConditions(done2).includes('Complete'), `同一版再跑一次應該也成功（冪等），log：\n${jobLogs(ns, 'migrate-v1-again')}`)
  assert.equal(columns(ns), schema, '再跑一次之後 orders 的欄位不應該改變')
  assert.equal(sql(ns, "SELECT string_agg(name, ',' ORDER BY name) FROM schema_migrations"), applied, '再跑一次不應該多出 migration 紀錄')
})
