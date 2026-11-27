// 第 10 課測試共用：dev 用的 postgres、migration 映像、讀 Job 的狀態
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { dockerBuild, kindLoad, kube, kubeIn, kubeJson, kubeconform, podSummary, readYaml, waitFor, waitPodsReady } from '../../helpers/k8s.ts'

export const MIGRATE_VERSIONS = ['v1', 'v2', 'v3-broken']

// 建置 learn-k8s/cafe-migrate 的三個版本並載入叢集（docker 有快取、節點上已經有同一個映像時 kind 會跳過，第二次起很快）
export function buildMigrateImages() {
  const dir = join(import.meta.dirname, 'migrate')
  for (const v of MIGRATE_VERSIONS) dockerBuild(dir, `learn-k8s/cafe-migrate:${v}`, { target: v })
  kindLoad(...MIGRATE_VERSIONS.map(v => `learn-k8s/cafe-migrate:${v}`))
}

// 檔案先過 kubeconform，再回傳裡面唯一的 kind 物件
export function readOne(dir: string, file: string, kind: string, name: string): any {
  const v = kubeconform([join(dir, file)])
  if (!v.ok) throw new Error(`${file} 沒通過 kubeconform（欄位名稱、縮排、型別要對，例如秒數是數字）：\n${v.message}`)
  const docs = readYaml(dir, file)
  if (docs.length !== 1 || docs[0].kind !== kind || docs[0].metadata?.name !== name) throw new Error(`${file} 只放一個名為 ${name} 的 ${kind}`)
  return docs[0]
}

// namespace 裡的 postgres（只給開發與測試，第 11 課講正式環境為什麼用 RDS）。
// 密碼每次隨機產生、只放在 Secret：postgres-admin 給資料庫自己，secretNames 裡的每個 Secret 都有一個 DATABASE_URL
const PG = { 'app.kubernetes.io/name': 'postgres' }
export async function startPostgres(ns: string, secretNames: string[]) {
  const pw = randomBytes(12).toString('hex')
  const s = kube('create', 'secret', 'generic', 'postgres-admin', '-n', ns, `--from-literal=password=${pw}`)
  if (s.code !== 0) throw new Error(`測試建立 Secret 失敗：${s.stderr}`)
  for (const name of secretNames) {
    const r = kube('create', 'secret', 'generic', name, '-n', ns, `--from-literal=DATABASE_URL=postgres://cafe:${pw}@postgres:5432/cafe`)
    if (r.code !== 0) throw new Error(`測試建立 Secret ${name} 失敗：${r.stderr}`)
  }
  const list = {
    apiVersion: 'v1', kind: 'List', items: [
      {
        apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'postgres' },
        spec: {
          replicas: 1, selector: { matchLabels: PG },
          template: {
            metadata: { labels: PG },
            spec: {
              terminationGracePeriodSeconds: 5,
              containers: [{
                name: 'postgres', image: 'postgres:18.6-alpine3.24', imagePullPolicy: 'IfNotPresent',
                env: [
                  { name: 'POSTGRES_USER', value: 'cafe' }, { name: 'POSTGRES_DB', value: 'cafe' },
                  { name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'postgres-admin', key: 'password' } } },
                ],
                ports: [{ containerPort: 5432 }],
                readinessProbe: { exec: { command: ['pg_isready', '-h', '127.0.0.1', '-U', 'cafe', '-d', 'cafe'] }, periodSeconds: 2 },
                resources: { requests: { cpu: '50m', memory: '64Mi' }, limits: { memory: '256Mi' } },
              }],
            },
          },
        },
      },
      { apiVersion: 'v1', kind: 'Service', metadata: { name: 'postgres' }, spec: { selector: PG, ports: [{ port: 5432 }] } },
    ],
  }
  const a = kubeIn(JSON.stringify(list), 'apply', '-n', ns, '-f', '-')
  if (a.code !== 0) throw new Error(`測試建立 postgres 失敗：${a.stderr}`)
  await waitPodsReady(ns, 'app.kubernetes.io/name=postgres', 1, 300_000)
}

// 在 postgres 容器裡執行 SQL（容器內的本機連線不用密碼），回傳 psql -tA 的輸出
export function sql(ns: string, query: string): string {
  const r = kube('exec', '-n', ns, 'deploy/postgres', '--', 'psql', '-U', 'cafe', '-d', 'cafe', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', query)
  if (r.code !== 0) throw new Error(`測試查詢資料庫失敗：${r.stderr}`)
  return r.stdout
}

// orders 表的欄位清單，例如 'customer_id,id,note,ordered_at,total'
export const columns = (ns: string, table = 'orders') =>
  sql(ns, `SELECT string_agg(column_name, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name = '${table}'`)

// Job 目前為 True 的 conditions（Complete、Failed、FailureTarget…）
export const trueConditions = (job: any): string[] => (job.status?.conditions ?? []).filter((c: any) => c.status === 'True').map((c: any) => c.type)

// 等 Job 結束（Complete 或 Failed），回傳 Job；逾時的訊息附上 Pod 狀態
export function waitJobDone(ns: string, name: string, ms: number): Promise<any> {
  return waitFor(() => {
    const job = kubeJson('get', 'job', name, '-n', ns)
    const t = trueConditions(job)
    if (t.includes('Complete') || t.includes('Failed')) return job
    throw new Error(podSummary(kubeJson('get', 'pods', '-n', ns, '-l', `batch.kubernetes.io/job-name=${name}`).items))
  }, ms, `Job ${name} 沒有在時間內結束`, 2000)
}

// Job 最後的 log（給失敗訊息用）
export const jobLogs = (ns: string, name: string) => {
  const r = kube('logs', `job/${name}`, '-n', ns, '--tail=15')
  return (r.stdout || r.stderr).trim()
}
