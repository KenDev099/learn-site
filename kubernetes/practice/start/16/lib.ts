// 第 16 課測試共用：渲染 chart、開發環境、部署腳本、Redis／PostgreSQL 查詢、持續流量
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
import {
  CONTEXT, KUBECONFIG, helmTemplate, kube, kubeconform, load, parseYaml, run, runScriptAsync, sleep, type LoadResult,
} from '../../helpers/k8s.ts'

export const DIR = import.meta.dirname
export const CHART = join(DIR, 'chart')
export const RELEASE = 'cafe'
export const API = 'app.kubernetes.io/instance=cafe,app.kubernetes.io/component=api'
export const WORKER = 'app.kubernetes.io/instance=cafe,app.kubernetes.io/component=worker'
export const NAME = 'app.kubernetes.io/name'

// helm lint ＋ helm template（values-local.yaml）＋ kubeconform，回傳物件陣列
export function render(chart = CHART, ns = 'k8s-16', tag = 'v1'): any[] {
  const values = [join(chart, 'values-local.yaml')]
  const lint = run('helm', ['lint', chart, '-f', values[0], '--set', `image.tag=${tag}`], { timeout: 30_000 })
  if (lint.code !== 0) throw new Error(`helm lint 沒通過：\n${(lint.stdout + '\n' + lint.stderr).trim()}`)
  const r = helmTemplate(chart, { release: RELEASE, namespace: ns, values, set: { 'image.tag': tag } })
  if (r.code !== 0) throw new Error(`helm template 失敗：${r.stderr}`)
  const v = kubeconform(['-'], r.stdout)
  if (!v.ok) throw new Error(`helm template 的輸出沒通過 kubeconform（常見原因：nindent 的格數不對，欄位跑到錯的層級）：\n${v.message}`)
  return parseYaml(r.stdout, 'helm template')
}
export const renderText = (chart = CHART, ns = 'k8s-16', tag = 'v1') =>
  helmTemplate(chart, { release: RELEASE, namespace: ns, values: [join(chart, 'values-local.yaml')], set: { 'image.tag': tag } }).stdout

export function find(objs: any[], kind: string, name: string): any {
  const o = objs.find(x => x.kind === kind && x.metadata?.name === name)
  if (!o) throw new Error(`chart 的輸出裡找不到 ${kind} ${name}`)
  return o
}
export const podSpec = (o: any) => o.spec?.template?.spec ?? {}
export const containers = (o: any): any[] => [...(podSpec(o).initContainers ?? []), ...(podSpec(o).containers ?? [])]
export const workloads = (objs: any[]) => objs.filter(o => ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'].includes(o.kind))

// migrate/job.yaml 換上版本號後的物件
export function migrateJob(dir = DIR, version = 'v1'): any {
  const text = run('sed', [`s/__VERSION__/${version}/g`, join(dir, 'migrate', 'job.yaml')]).stdout
  return parseYaml(text, 'migrate/job.yaml')[0]
}

// "128Mi" → MiB
export function mib(q: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|K|M|G)?$/.exec(String(q ?? ''))
  if (!m) return NaN
  const f: Record<string, number> = { Ki: 1 / 1024, Mi: 1, Gi: 1024, K: 1e3 / 1048576, M: 1e6 / 1048576, G: 1e9 / 1048576, '': 1 / 1048576 }
  return Number(m[1]) * f[m[2] ?? '']
}

// ---- NetworkPolicy：某種 Pod 能不能連到某個目標 ----
const selects = (sel: any, labels: Record<string, string>) =>
  sel != null && Object.entries(sel.matchLabels ?? {}).every(([k, v]) => labels[k] === v) && !(sel.matchExpressions ?? []).length
export const isDefaultDeny = (np: any) => {
  const s = np.spec ?? {}
  return selects(s.podSelector, {}) && Object.keys(s.podSelector.matchLabels ?? {}).length === 0 &&
    (s.policyTypes ?? []).includes('Ingress') && (s.policyTypes ?? []).includes('Egress') && !(s.ingress?.length) && !(s.egress?.length)
}
// 目標：Pod 的 label、它所在 namespace 的 label（目標都在別的 namespace）、port、protocol
type Target = { labels: Record<string, string>, nsLabels: Record<string, string>, port: number, protocol?: string }
function peerMatches(peer: any, t: Target): boolean {
  if (peer.ipBlock) return peer.ipBlock.cidr === '0.0.0.0/0'
  if (!peer.namespaceSelector || !selects(peer.namespaceSelector, t.nsLabels)) return false   // 沒有 namespaceSelector＝只限同一個 namespace
  return peer.podSelector ? selects(peer.podSelector, t.labels) : true
}
function portMatches(ports: any[] | undefined, t: Target) {
  return !ports?.length || ports.some(p => (p.port === undefined || p.port === t.port) && (p.protocol ?? 'TCP') === (t.protocol ?? 'TCP'))
}
// 套在 podLabels 上的 NetworkPolicy 是否允許連到 t（沒有任何政策選到這種 Pod 時＝不隔離＝允許）
export function egressAllowed(nps: any[], podLabels: Record<string, string>, t: Target): boolean {
  const mine = nps.filter(np => selects(np.spec?.podSelector, podLabels) && (np.spec?.policyTypes ?? []).includes('Egress'))
  if (!mine.length) return true
  return mine.some(np => (np.spec.egress ?? []).some((r: any) => (!r.to?.length || r.to.some((p: any) => peerMatches(p, t))) && portMatches(r.ports, t)))
}
export function ingressAllowed(nps: any[], podLabels: Record<string, string>, port: number): boolean {
  const mine = nps.filter(np => selects(np.spec?.podSelector, podLabels) && (np.spec?.policyTypes ?? []).includes('Ingress'))
  if (!mine.length) return true
  return mine.some(np => (np.spec.ingress ?? []).some((r: any) => !r.from?.length && portMatches(r.ports, { labels: {}, nsLabels: {}, port })))
}
// 資料庫所在的 namespace 每個環境名稱不同（k8s-16-data、k8s-16-ex2-data…），只有課程的標籤是固定的
const DATA_NS = { 'learn.course': 'kubernetes', 'learn.task': '16' }
export const POSTGRES: Target = { labels: { [NAME]: 'postgres' }, nsLabels: DATA_NS, port: 5432 }
export const REDIS: Target = { labels: { [NAME]: 'redis' }, nsLabels: DATA_NS, port: 6379 }
export const DNS: Target = { labels: { 'k8s-app': 'kube-dns' }, nsLabels: { 'kubernetes.io/metadata.name': 'kube-system' }, port: 53, protocol: 'UDP' }

// ---- 叢集 ----
export const helm = (...args: string[]) => run('helm', [...args, '--kubeconfig', KUBECONFIG, '--kube-context', CONTEXT], { timeout: 600_000 })

// 用 dev-up.sh 從零建立 <ns> 與 <ns>-data（資料庫、Redis、Secret cafe-secrets）
export async function devUp(ns: string, dir = DIR) {
  const r = await runScriptAsync(dir, 'dev-up.sh', [ns], { timeout: 900_000 })
  if (r.code !== 0) throw new Error(`dev-up.sh ${ns} 失敗（這是課程提供的腳本，通常是叢集太忙：執行 node kubernetes/practice/bin/cluster.mjs status）：\n${(r.stderr || r.stdout).split('\n').slice(-5).join('\n')}`)
}

// 監看腳本呼叫的 kubectl 與 helm（同一個紀錄檔，保留先後順序）
export function spyTools() {
  const dir = run('mktemp', ['-d', '-t', 'learn-k8s-16-spy']).stdout
  const log = join(dir, 'calls.jsonl')
  for (const tool of ['kubectl', 'helm']) {
    const real = run('bash', ['-c', `command -v ${tool}`]).stdout
    if (!real) throw new Error(`找不到 ${tool}`)
    run('bash', ['-c', `cat > "${dir}/${tool}" <<'EOF'\n#!/bin/bash\nnode -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify([process.argv[2], ...process.argv.slice(3)]) + "\\n")' "${log}" ${tool} "$@"\nexec "${real}" "$@"\nEOF\nchmod +x "${dir}/${tool}"`])
  }
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: (): string[][] => { const t = run('cat', [log]).stdout; return t ? t.split('\n').map(l => JSON.parse(l)) : [] },
    cleanup: () => run('rm', ['-rf', dir]),
  }
}

// 執行學習者的 deploy.sh／rollback.sh，回傳結果、花的秒數與呼叫過的 kubectl／helm
export async function script(name: string, ns: string, args: string[] = [], dir = DIR) {
  const spy = spyTools()
  try {
    const t0 = Date.now()
    const r = await runScriptAsync(dir, name, args, { env: { NS: ns, ...spy.env }, timeout: 900_000 })
    return { ...r, secs: Math.round((Date.now() - t0) / 1000), calls: spy.calls() }
  } finally { spy.cleanup() }
}

// 在 <ns>-data 的 redis 執行 redis-cli
export function redis(ns: string, ...args: string[]): string {
  const r = kube('exec', '-n', `${ns}-data`, 'deploy/redis', '--', 'sh', '-c', 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli "$@"', 'redis-cli', ...args)
  if (r.code !== 0) throw new Error(`redis-cli ${args.join(' ')} 失敗：${r.stderr}`)
  return r.stdout
}
// 在 <ns>-data 的 postgres 以管理員身分查詢，回傳 psql -tA 的輸出
export function psql(ns: string, sql: string): string {
  const r = kube('exec', '-n', `${ns}-data`, 'deploy/postgres', '--', 'psql', '-U', 'postgres', '-d', 'cafe', '-tAc', sql)
  if (r.code !== 0) throw new Error(`psql 查詢失敗：${r.stderr}`)
  return r.stdout
}

export const readyPods = (pods: any[]) => pods.filter((p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))

// 在 fn 執行的整段時間持續送流量（同第 9 課）：兩條錯開的 loadgen 迴圈，每段 20 秒，合計每秒 rps 個請求
export async function trafficDuring<T>(urls: string[], rps: number, fn: () => Promise<T>): Promise<{ load: LoadResult, value: T }> {
  const results: LoadResult[] = []
  let done = false
  const loop = async (delay: number) => {
    await sleep(delay)
    while (!done) results.push(await load(urls, { requests: Math.round(rps / 2 * 20), rps: rps / 2, timeoutMs: 20_000 }))
  }
  const loops = [loop(0), loop(10_000)]
  await sleep(3000)
  let value!: T
  try { value = await fn() } finally { done = true }
  await Promise.all(loops)
  const sum = { requests: 0, errors: 0, errorSamples: [] as string[] }
  for (const r of results) { sum.requests += r.requests; sum.errors += r.errors; sum.errorSamples.push(...r.errorSamples) }
  sum.errorSamples = sum.errorSamples.slice(0, 10)
  return { load: sum as LoadResult, value }
}

// 去掉 bash 註解
export const stripComments = (sh: string) => sh.split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n')
export const sqlFiles = (dir = DIR) => readdirSync(join(dir, 'migrate', 'sql')).filter(f => f.endsWith('.sql')).sort()

// 依「## 標題」或「### 標題」切段（去掉 HTML 註解）
export function sections(md: string, level: '##' | '###'): [string, string][] {
  const out: [string, string][] = []
  const re = new RegExp(`^${level}\\s+(.+?)\\s*$`)
  for (const line of md.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const h = re.exec(line)
    if (h) { out.push([h[1], '']); continue }
    if (level === '##' && /^#\s/.test(line)) continue
    if (out.length) out[out.length - 1][1] += line + '\n'
  }
  return out
}
