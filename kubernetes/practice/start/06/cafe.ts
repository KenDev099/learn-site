// 第 6 課測試共用：讀 Pod 的 /config、等 Deployment 的 Pod 換成指定的設定
import { kube, kubeJson, parseYaml, podSummary, probe, readText, waitFor } from '../../helpers/k8s.ts'
import { readdirSync } from 'node:fs'

export const SELECTOR = 'app.kubernetes.io/name=cafe-api,app.kubernetes.io/instance=main'

const isReady = (p: any) => !p.metadata.deletionTimestamp && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True')

// 資料夾裡所有 .yaml／.yml 的物件（不含子資料夾）
export function readAll(dir: string): any[] {
  let files: string[]
  try { files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f)).sort() } catch { throw new Error(`找不到資料夾 ${dir}`) }
  return files.flatMap(f => parseYaml(readText(dir, f), f))
}

export function container(docs: any[]): any {
  const deps = docs.filter(d => d.kind === 'Deployment')
  if (deps.length !== 1 || deps[0].metadata?.name !== 'cafe-api') throw new Error(`要剛好一個名為 cafe-api 的 Deployment，現在有 ${deps.length} 個 Deployment`)
  const c = deps[0].spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  if (!c) throw new Error('Deployment 裡要有名為 api 的容器')
  return c
}

// 所有 Ready 的 cafe-api Pod（不含正在刪除的）；有容器停在 CreateContainerConfigError 時直接說明
export function readyPods(ns: string): any[] {
  const pods = kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items
  for (const p of pods) for (const c of p.status?.containerStatuses ?? [])
    if (c.state?.waiting?.reason === 'CreateContainerConfigError')
      throw new Error(`Pod ${p.metadata.name} 停在 CreateContainerConfigError：${c.state.waiting.message}`)
  const ready = pods.filter(isReady)
  if (!ready.length) throw new Error(podSummary(pods))
  return ready
}

export function podConfig(pod: any): any {
  const r = probe(`http://${pod.status.podIP}:3000/config`)
  if (r.status !== 200) throw new Error(`GET /config 失敗（${pod.metadata.name}）：${r.status || r.error}`)
  return JSON.parse(r.body)
}

// 等到 Ready 的 Pod 剛好 count 個，而且每個的 /config 都符合 ok；回傳 [{ pod, config }]
export function waitConfigs(ns: string, count: number, ok: (cfg: any, pod: any) => boolean, ms: number, message: string) {
  return waitFor(() => {
    const pods = readyPods(ns)
    if (pods.length !== count) throw new Error(`Ready 的 Pod 有 ${pods.length} 個，要 ${count} 個：\n${podSummary(pods)}`)
    const list = pods.map(pod => ({ pod, config: podConfig(pod) }))
    const bad = list.filter(x => !ok(x.config, x.pod))
    if (bad.length) throw new Error(bad.map(x => `${x.pod.metadata.name}：${JSON.stringify(x.config)}`).join('\n'))
    return list
  }, ms, message, 2000)
}

export function rolloutStatus(ns: string, timeout = '150s') {
  const r = kube('rollout', 'status', 'deployment/cafe-api', '-n', ns, `--timeout=${timeout}`)
  if (r.code !== 0) throw new Error(`Deployment cafe-api 沒有在 ${timeout} 內更新完成：${r.stderr || r.stdout}\n${podSummary(kubeJson('get', 'pods', '-n', ns, '-l', SELECTOR).items)}`)
}

