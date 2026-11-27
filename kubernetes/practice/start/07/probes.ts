// 第 7 課測試共用：讀 deployment.yaml 的容器設定、算 probe 的時間、在持續流量下做事
import { kube, kubeJson, kubeconform, load, podSummary, readYaml, sleep, type LoadResult } from '../../helpers/k8s.ts'
import { join } from 'node:path'

export const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'

// deployment.yaml 先過 kubeconform，再回傳 Deployment 與名為 api 的容器
export function readDeployment(dir: string): { dep: any, c: any } {
  const v = kubeconform([join(dir, 'deployment.yaml')])
  if (!v.ok) throw new Error(`deployment.yaml 沒通過 kubeconform（欄位名稱、縮排、型別要對，例如 periodSeconds 是數字）：\n${v.message}`)
  const docs = readYaml(dir, 'deployment.yaml')
  const dep = docs.find(d => d.kind === 'Deployment')
  if (docs.length !== 1 || dep?.metadata?.name !== 'cafe-api') throw new Error('deployment.yaml 只放一個名為 cafe-api 的 Deployment')
  const c = dep.spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  if (!c) throw new Error('Deployment 裡要有名為 api 的容器')
  return { dep, c }
}

export const envOf = (c: any, name: string): string | undefined => c.env?.find((e: any) => e.name === name)?.value

// probe 的實際值（沒寫的欄位用 Kubernetes 的預設值）
export function timing(p: any) {
  return {
    initialDelaySeconds: p.initialDelaySeconds ?? 0,
    periodSeconds: p.periodSeconds ?? 10,
    timeoutSeconds: p.timeoutSeconds ?? 1,
    failureThreshold: p.failureThreshold ?? 3,
  }
}

// 所有容器重啟次數的總和
export function restarts(ns: string): { total: number, summary: string } {
  const pods = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
  const total = pods.reduce((n: number, p: any) => n + (p.status?.containerStatuses ?? []).reduce((m: number, c: any) => m + (c.restartCount ?? 0), 0), 0)
  return { total, summary: podSummary(pods) }
}

export function rollout(ns: string, timeout = '180s') {
  const r = kube('rollout', 'status', 'deployment/cafe-api', '-n', ns, `--timeout=${timeout}`)
  if (r.code !== 0) throw new Error(`deployment/cafe-api 沒有在 ${timeout} 內完成：${r.stderr || r.stdout}\n${podSummary(kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items)}`)
}

// 在 fn 執行的整段時間持續送流量：兩條錯開的 loadgen 迴圈（每段 20 秒），合計每秒 rps 個請求。回傳合併的統計
export async function trafficDuring(urls: string[], rps: number, fn: () => Promise<void> | void): Promise<LoadResult> {
  const results: LoadResult[] = []
  let done = false
  const loop = async (delay: number) => {
    await sleep(delay)
    while (!done) results.push(await load(urls, { requests: Math.round(rps / 2 * 20), rps: rps / 2, timeoutMs: 10_000 }))
  }
  const loops = [loop(0), loop(10_000)]
  await sleep(3000)
  try { await fn() } finally { done = true }
  await Promise.all(loops)
  const sum: LoadResult = { requests: 0, ok: 0, errors: 0, statuses: {}, errorSamples: [], instances: {}, p50: 0, p95: 0, durationMs: 0 }
  for (const r of results) {
    sum.requests += r.requests; sum.ok += r.ok; sum.errors += r.errors
    sum.errorSamples.push(...r.errorSamples)
    for (const [k, v] of Object.entries(r.statuses)) sum.statuses[k] = (sum.statuses[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.instances)) sum.instances[k] = (sum.instances[k] ?? 0) + v
  }
  sum.errorSamples = sum.errorSamples.slice(0, 10)
  return sum
}
