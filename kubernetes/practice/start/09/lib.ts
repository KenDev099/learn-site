// 第 9 課測試共用：讀 manifest、算滾動更新的上下限、在持續流量下做事、記錄 availableReplicas 的每一次變化
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { CONTEXT, KUBECONFIG, kubeAsync, kubeJson, kubeconform, load, podSummary, readYaml, sleep, type LoadResult } from '../../helpers/k8s.ts'

// 檔案先過 kubeconform，再回傳裡面的物件
export function readManifest(dir: string, file: string): any[] {
  const v = kubeconform([join(dir, file)])
  if (!v.ok) throw new Error(`${file} 沒通過 kubeconform（欄位名稱、縮排、型別要對，例如 maxSkew 是數字）：\n${v.message}`)
  return readYaml(dir, file)
}

// deployment.yaml 只放一個名為 cafe-api 的 Deployment，回傳它與名為 api 的容器
export function readDeployment(dir: string): { dep: any, c: any } {
  const docs = readManifest(dir, 'deployment.yaml')
  const dep = docs.find(d => d.kind === 'Deployment')
  if (docs.length !== 1 || dep?.metadata?.name !== 'cafe-api') throw new Error('deployment.yaml 只放一個名為 cafe-api 的 Deployment')
  const c = dep.spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  if (!c) throw new Error('Deployment 裡要有名為 api 的容器')
  return { dep, c }
}

// maxSurge／maxUnavailable 換算成 Pod 數：百分比時 surge 無條件進位、unavailable 無條件捨去；沒寫用預設 25%
export function resolveRolling(dep: any): { type: string, surge: number, unavailable: number } {
  const replicas = dep.spec?.replicas ?? 1
  const type = dep.spec?.strategy?.type ?? 'RollingUpdate'
  const ru = dep.spec?.strategy?.rollingUpdate ?? {}
  const conv = (v: any, up: boolean) => {
    const x = v ?? '25%'
    if (typeof x === 'number') return x
    const n = replicas * parseFloat(x) / 100
    return up ? Math.ceil(n) : Math.floor(n)
  }
  return { type, surge: conv(ru.maxSurge, true), unavailable: conv(ru.maxUnavailable, false) }
}

export const readyPods = (ns: string, selector: string) => kubeJson('get', 'pods', '-n', ns, '-l', selector).items
  .filter((p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))

// kubectl 的程序逾時比 --timeout 多 60 秒：kube() 預設 120 秒會在 rollout status 自己的時限之前就把它砍掉
export async function rolloutStatus(ns: string, timeout = 240) {
  const r = await kubeAsync(['rollout', 'status', 'deployment/cafe-api', '-n', ns, `--timeout=${timeout}s`], { timeout: (timeout + 60) * 1000 })
  if (r.code !== 0) throw new Error(`deployment/cafe-api 沒有在 ${timeout} 秒內完成：${r.stderr || r.stdout}\n${podSummary(kubeJson('get', 'pods', '-n', ns).items)}`)
}

// 用 kubectl get -w 記錄 Deployment 的 status.availableReplicas 每一次的值（不是輪詢，不會漏掉短暫的下降）
export function watchAvailable(ns: string) {
  const values: number[] = []
  const p = spawn('kubectl', ['--kubeconfig', KUBECONFIG, '--context', CONTEXT, 'get', 'deployment', 'cafe-api', '-n', ns, '-w',
    '-o', 'jsonpath={.status.availableReplicas}{"\\n"}'])
  let buf = ''
  p.stdout.on('data', d => {
    buf += d
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const l of lines) values.push(Number(l.trim() || 0))
  })
  return { values, stop: () => p.kill() }
}

// 在 fn 執行的整段時間持續送流量（逾時 20 秒：這台機器負載很高時，10 秒會被偶發的停頓誤判成錯誤）：兩條錯開的 loadgen 迴圈（每段 20 秒），合計每秒 rps 個請求。fn 要是非同步的，流量才不會中斷
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
  const sum: LoadResult = { requests: 0, ok: 0, errors: 0, statuses: {}, errorSamples: [], instances: {}, p50: 0, p95: 0, durationMs: 0 }
  for (const r of results) {
    sum.requests += r.requests; sum.ok += r.ok; sum.errors += r.errors
    sum.errorSamples.push(...r.errorSamples)
    for (const [k, v] of Object.entries(r.statuses)) sum.statuses[k] = (sum.statuses[k] ?? 0) + v
    for (const [k, v] of Object.entries(r.instances)) sum.instances[k] = (sum.instances[k] ?? 0) + v
  }
  sum.errorSamples = sum.errorSamples.slice(0, 10)
  return { load: sum, value }
}
