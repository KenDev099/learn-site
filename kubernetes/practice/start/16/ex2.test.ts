// 練習 2：deploy.sh 從零部署 v1：migration Job（migrator 帳號）先完成，再 helm upgrade --install，最後煙霧測試
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { deleteNamespace, kubeJson, nsName, probe, readText, requireCluster, waitFor } from '../../helpers/k8s.ts'
import { API, DIR, WORKER, containers, devUp, find, migrateJob, podSpec, psql, readyPods, redis, render, script, stripComments } from './lib.ts'

const ns = nsName(16, 2)
let staticOk = false

after(() => { deleteNamespace(ns); deleteNamespace(`${ns}-data`) })

test('chart 與 deploy.sh：api 用 cafe_app 的 DATABASE_URL、migration 不在 initContainer；deploy.sh 先等 migration 成功再 helm upgrade', { timeout: 60_000 }, () => {
  const objs = render()
  for (const name of ['cafe-api', 'cafe-worker']) {
    const dep = find(objs, 'Deployment', name)
    assert(!podSpec(dep).initContainers?.length, `${name} 有 initContainers：migration 放在 Pod 裡，每個副本、每次擴展都會跑，還要用 migrator 帳號。用獨立的 Job，在 deploy.sh 裡排在 helm upgrade 之前（第 10 課）`)
    for (const c of containers(dep)) for (const e of c.env ?? [])
      assert.notEqual(e.valueFrom?.secretKeyRef?.key, 'DATABASE_URL_MIGRATOR', `${name} 用了 DATABASE_URL_MIGRATOR：migrator 帳號能建表、刪表，應用程式被入侵就能毀掉整個資料庫。應用程式只用 DATABASE_URL（cafe_app）`)
  }
  const job = migrateJob()
  assert.equal(job.spec.template.spec.containers[0].env[0].valueFrom.secretKeyRef.key, 'DATABASE_URL_MIGRATOR', 'migrate/job.yaml 是課程提供的，不用改')

  const sh = stripComments(readText(DIR, 'deploy.sh'))
  assert.doesNotMatch(sh, /TODO：還沒寫/, 'deploy.sh 還是起始檔：把三個步驟寫出來')
  const iJob = sh.search(/migrate\/job\.yaml/), iHelm = sh.search(/helm\s+upgrade/)
  assert(iJob >= 0, 'deploy.sh 要用 migrate/job.yaml（把 __VERSION__ 換成版本）建立這一版的 migration Job')
  assert(iHelm >= 0, 'deploy.sh 要用 helm upgrade --install 部署 chart')
  assert(iJob < iHelm, 'deploy.sh 要先跑 migration、等它成功，再 helm upgrade：先換應用的話，新版程式會在欄位還不存在時就開始收流量')
  assert(/Failed/.test(sh), 'deploy.sh 要處理 migration 失敗：看到 Job 的 Failed 就停下來（非 0 結束），不能只等 Complete 等到逾時（第 10 課）')
  assert.match(sh, /--rollback-on-failure/, 'helm upgrade 加 --rollback-on-failure：新版沒 Ready 就自動回到上一個 revision')
  assert.match(sh, /--wait\b/, 'helm upgrade 要明寫 --wait：不加時 Helm 4 不等 Pod Ready')
  staticOk = true
})

test('從零部署 v1：migration 用 migrator 帳號建表並在 api 建立前完成；api 2 個、worker 2 個 Ready；煙霧測試；worker 處理得到 job', { timeout: 1_800_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再部署到叢集')
  requireCluster()
  await devUp(ns)
  const r = await script('deploy.sh', ns, ['v1'])
  assert.equal(r.code, 0, `deploy.sh v1 應該以 0 結束，實際是 ${r.code}：${(r.stderr || r.stdout).split('\n').slice(-6).join('\n')}`)

  const job = kubeJson('get', 'job', 'cafe-migrate-v1', '-n', ns)
  assert(job.status?.succeeded >= 1, 'Job cafe-migrate-v1 應該成功完成')
  const api = kubeJson('get', 'deployment', 'cafe-api', '-n', ns)
  assert(new Date(job.status.completionTime) <= new Date(api.metadata.creationTimestamp),
    `migration 在 ${job.status.completionTime} 才完成，api 的 Deployment 卻在 ${api.metadata.creationTimestamp} 就建立了：要等 Job 完成再 helm upgrade`)
  assert.equal(psql(ns, "SELECT tableowner FROM pg_tables WHERE tablename = 'orders'"), 'cafe_migrator', 'orders 表的擁有者應該是 cafe_migrator（migration 用 migrator 帳號跑）')

  const apiPods = readyPods(kubeJson('get', 'pods', '-n', ns, '-l', API).items)
  assert.equal(apiPods.length, 2, `deploy.sh 結束時應該有 2 個 Ready 的 api Pod，現在有 ${apiPods.length} 個：helm 要加 --wait`)
  const workers = readyPods(kubeJson('get', 'pods', '-n', ns, '-l', WORKER).items)
  assert.equal(workers.length, 2, `應該有 2 個 Ready 的 worker Pod，現在有 ${workers.length} 個`)

  const smoke = r.calls.filter(a => a[0] === 'kubectl' && a.includes('exec') && a.some(x => /curl|wget/.test(x)))
  assert(smoke.length, 'deploy.sh 最後要做煙霧測試：例如 kubectl exec -n k8s-tools deploy/probe -- curl -fsS http://cafe-api.$NS.svc.cluster.local/health/ready')
  assert(smoke.some(a => a.some(x => /^-\w*f/.test(x) || x === '--fail')), '煙霧測試的 curl 要加 -f（--fail）：不加的話 503 也會以 0 結束，壞掉的部署照樣被判成功')
  const p = probe(`http://cafe-api.${ns}.svc.cluster.local/products`)
  assert.equal(p.status, 200, `經過 Service 的 GET /products 應該是 200，實際 ${p.status || p.error}`)

  redis(ns, 'LPUSH', 'receipts:pending', 'smoke-1', 'smoke-2', 'smoke-3')
  await waitFor(() => redis(ns, 'GET', 'receipts:sent') === '3', 90_000,
    'worker 90 秒內沒有寄出 3 張收據：用 kubectl logs -n ' + ns + ' -l app.kubernetes.io/component=worker 看它有沒有連上 Redis（NetworkPolicy、REDIS_URL）')
})
