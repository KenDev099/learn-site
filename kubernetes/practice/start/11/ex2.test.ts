// 練習 2：dev 用的 PostgreSQL 寫成 StatefulSet＋headless Service：固定名稱 pg-0、固定 DNS pg-0.pg、每個 Pod 自己的 PVC
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { applyDir, deleteNamespace, kube, kubeJson, nsName, requireCluster, waitPodsReady } from '../../helpers/k8s.ts'
import { containerOf, exec, only, readManifest, fresh } from './storage.ts'

const dir = join(import.meta.dirname, 'ex2')
const ns = nsName(11, 2)
const password = randomBytes(12).toString('hex')
let staticOk = false

before(() => requireCluster())
after(() => deleteNamespace(ns))

test('pg.yaml 是 StatefulSet pg（serviceName pg、volumeClaimTemplates 1Gi 掛在 /var/lib/postgresql），service.yaml 是 headless', { timeout: 30_000 }, () => {
  const docs = readManifest(dir, 'pg.yaml')
  assert(!docs.some(d => d.kind === 'Deployment'),
    'pg.yaml 裡還有 Deployment：資料庫要用 StatefulSet，Pod 名稱固定（pg-0），每個 Pod 有自己的 PVC，重建後接回同一顆磁碟')
  assert(!docs.some(d => d.kind === 'PersistentVolumeClaim'), '刪掉手寫的 PersistentVolumeClaim pg-data：PVC 改由 volumeClaimTemplates 替每個 Pod 建立')
  const sts = only(docs, 'StatefulSet', 'pg', 'pg.yaml')
  assert.equal(sts.spec.serviceName, 'pg', 'spec.serviceName 要是 pg（headless Service 的名稱），pg-0.pg 這個 DNS 名稱才會存在')
  assert.equal(sts.spec.replicas ?? 1, 1, 'replicas 是 1')
  const c = containerOf(sts, 'postgres')
  assert.equal(c.image, 'postgres:18.6-alpine3.24', '映像維持 postgres:18.6-alpine3.24')
  assert.equal(c.readinessProbe?.exec?.command?.[0], 'pg_isready', 'readinessProbe 維持 pg_isready')
  const pw = (c.env ?? []).find((e: any) => e.name === 'POSTGRES_PASSWORD')
  assert.equal(pw?.valueFrom?.secretKeyRef?.name, 'pg-admin', 'POSTGRES_PASSWORD 維持從 Secret pg-admin 讀')
  const tpl = (sts.spec.volumeClaimTemplates ?? []).find((t: any) => t.metadata?.name === 'data')
  assert(tpl, '要有名為 data 的 volumeClaimTemplates：StatefulSet 會替 pg-0 建立 PVC data-pg-0')
  assert.deepEqual(tpl.spec?.accessModes, ['ReadWriteOnce'], 'volumeClaimTemplates 的 accessModes 是 [ReadWriteOnce]')
  assert.equal(tpl.spec?.resources?.requests?.storage, '1Gi', 'volumeClaimTemplates 要 1Gi')
  assert(!(sts.spec.template.spec.volumes ?? []).some((v: any) => v.name === 'data'),
    'Pod 範本的 volumes 裡不要再有 data：同名的 volumeClaimTemplates 會自動變成 Pod 的 volume')
  const m = (c.volumeMounts ?? []).find((x: any) => x.name === 'data')
  assert(m, '容器要用 volumeMounts 掛上 data')
  assert.equal(m.mountPath, '/var/lib/postgresql', m.mountPath === '/var/lib/postgresql/data'
    ? 'postgres 18 起官方映像的資料目錄（PGDATA）是 /var/lib/postgresql/18/docker：掛在 /var/lib/postgresql/data 時入口腳本會直接報錯結束。掛在 /var/lib/postgresql'
    : 'data 要掛在 /var/lib/postgresql（postgres 18 的 PGDATA /var/lib/postgresql/18/docker 在它底下）')

  const svc = only(readManifest(dir, 'service.yaml'), 'Service', 'pg', 'service.yaml')
  assert.equal(svc.spec?.clusterIP, 'None', 'Service pg 要寫 clusterIP: None（headless）：DNS 才會為每個 Pod 建 pg-0.pg 這樣的名稱，而不是只給一個負載平衡的虛擬 IP')
  assert.equal(svc.spec?.selector?.['app.kubernetes.io/name'], 'pg', 'Service 的 selector 維持 app.kubernetes.io/name: pg')
  staticOk = true
})

test('pg-0 Ready、用 pg-0.pg 連得上；刪掉 pg-0 後新的 pg-0 還有資料；刪掉 StatefulSet 後 PVC 還在', { timeout: 1_200_000 }, async () => {
  assert(staticOk, '先讓上一項（檔案的檢查）通過，再套用到叢集')
  await fresh(ns)
  const s = kube('create', 'secret', 'generic', 'pg-admin', '-n', ns, `--from-literal=password=${password}`)
  if (s.code !== 0) throw new Error(`測試建立 Secret pg-admin 失敗：${s.stderr}`)
  applyDir(dir, ns)
  const [first] = await waitPodsReady(ns, 'app.kubernetes.io/name=pg', 1, 360_000)
  assert.equal(first.metadata.name, 'pg-0', `StatefulSet 的 Pod 應該叫 pg-0，現在是 ${first.metadata.name}`)

  // 走網路、用密碼連：DNS 名稱 pg-0.pg（headless Service）＋ Secret 裡的密碼
  const psql = (q: string) => exec(ns, 'pg-0', 'postgres', 'env', `PGPASSWORD=${password}`, 'psql', '-h', 'pg-0.pg', '-U', 'cafe', '-d', 'cafe', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', q)
  const w = psql("CREATE TABLE receipts (id int PRIMARY KEY, total int); INSERT INTO receipts VALUES (1, 110)")
  assert.equal(w.code, 0, `用 psql -h pg-0.pg 連不上或寫入失敗：${w.stderr}\n檢查 Service pg 是不是 headless、StatefulSet 的 serviceName 是不是 pg`)

  const d = kube('delete', 'pod', 'pg-0', '-n', ns, '--wait=true', '--timeout=120s')
  assert.equal(d.code, 0, `測試刪除 pg-0 失敗：${d.stderr}`)
  const [second] = await waitPodsReady(ns, 'app.kubernetes.io/name=pg', 1, 360_000)
  assert.equal(second.metadata.name, 'pg-0', '重建的 Pod 應該還是叫 pg-0')
  assert.notEqual(second.metadata.uid, first.metadata.uid, '應該是 StatefulSet 重建的新 Pod')
  const r = psql('SELECT total FROM receipts WHERE id = 1')
  assert.equal(r.code, 0, `新的 pg-0 查不到 receipts 表：${r.stderr}\n資料沒有寫在 PVC 上（檢查 mountPath）`)
  assert.equal(r.stdout, '110', '新的 pg-0 應該讀得到剛才寫入的那一筆')

  const del = kube('delete', 'statefulset', 'pg', '-n', ns, '--wait=true', '--timeout=120s')
  assert.equal(del.code, 0, `測試刪除 StatefulSet 失敗：${del.stderr}`)
  const pvc = kubeJson('get', 'pvc', '-n', ns).items.map((p: any) => p.metadata.name)
  assert(pvc.includes('data-pg-0'), `刪掉 StatefulSet 後 PVC data-pg-0 應該還在（預設 whenDeleted: Retain），現在的 PVC：${pvc.join('、') || '沒有'}`)
})
