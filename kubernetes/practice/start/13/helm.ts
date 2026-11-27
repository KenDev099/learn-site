// 第 13 課測試共用：helm template 產生物件、helm 連叢集、監看腳本呼叫的 helm
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTEXT, KUBECONFIG, helmTemplate, kubeconform, load, parseYaml, run, sleep, type LoadResult } from '../../helpers/k8s.ts'

type Opts = { release?: string, values?: string[], set?: Record<string, string> }

// helm template 成功並通過 kubeconform，回傳物件陣列；失敗時丟出 helm 或 kubeconform 的訊息
export function render(chart: string, opts: Opts = {}, label = 'helm template'): any[] {
  const r = helmTemplate(chart, opts)
  if (r.code !== 0) throw new Error(`${label} 失敗：${r.stderr}`)
  const v = kubeconform(['-'], r.stdout)
  if (!v.ok) throw new Error(`${label} 的輸出沒通過 kubeconform（常見原因：nindent 的格數不對，欄位跑到錯的層級）：\n${v.message}`)
  return parseYaml(r.stdout, label)
}

// 找出某種物件；name 不給時只要求恰好一個
export function one(objs: any[], kind: string, what = '輸出'): any {
  const list = objs.filter(o => o.kind === kind)
  if (list.length !== 1) throw new Error(`${what}裡應該恰好有 1 個 ${kind}，現在有 ${list.length} 個`)
  return list[0]
}
export const container = (dep: any) => {
  const c = dep.spec?.template?.spec?.containers?.find((x: any) => x.name === 'api')
  if (!c) throw new Error('Deployment 裡要有名為 api 的容器')
  return c
}

// helm（課程叢集）：一律帶課程的 kubeconfig 與 context
export const helm = (...args: string[]) => run('helm', [...args, '--kubeconfig', KUBECONFIG, '--kube-context', CONTEXT], { timeout: 400_000 })
export function history(release: string, ns: string): any[] {
  const r = helm('history', release, '-n', ns, '-o', 'json')
  if (r.code !== 0) throw new Error(`helm history ${release} 失敗：${r.stderr}`)
  return JSON.parse(r.stdout)
}

// 監看腳本呼叫了哪些 helm：PATH 最前面放一個記錄參數再轉給真的 helm 的 helm
export function spyHelm() {
  const real = run('bash', ['-c', 'command -v helm']).stdout
  if (!real) throw new Error('找不到 helm：執行 brew install helm')
  const dir = mkdtempSync(join(tmpdir(), 'learn-k8s-helm-spy-'))
  const log = join(dir, 'calls.jsonl')
  writeFileSync(join(dir, 'helm'), `#!/bin/bash\nnode -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)) + "\\n")' "${log}" "$@"\nexec "${real}" "$@"\n`, { mode: 0o755 })
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

// 去掉 bash 註解（# 開頭到行尾，不處理字串裡的 #：題目的腳本用不到）
export const stripComments = (sh: string) => sh.split('\n').map(l => l.replace(/(^|\s)#.*$/, '')).join('\n')

// --timeout 的值換成秒：3m、180s、2m30s
export function seconds(d: string): number {
  let s = 0
  for (const [, n, u] of d.matchAll(/(\d+)(h|m|s)/g)) s += Number(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : 1)
  return s
}

// 在 fn 執行的整段時間持續送流量（同第 9 課）：兩條錯開的 loadgen 迴圈，每段 20 秒，合計每秒 rps 個請求
export async function trafficDuring<T>(urls: string[], rps: number, fn: () => Promise<T>): Promise<{ load: LoadResult, value: T }> {
  const results: LoadResult[] = []
  let done = false
  const loop = async (delay: number) => {
    await sleep(delay)
    while (!done) results.push(await load(urls, { requests: Math.round(rps / 2 * 20), rps: rps / 2, timeoutMs: 10_000 }))
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
