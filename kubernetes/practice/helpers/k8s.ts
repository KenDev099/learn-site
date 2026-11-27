// Kubernetes 課的測試共用工具。題目資料夾都是兩層（work/<題號>/、verify/<題號>-<label>/），所以 import '../../helpers/k8s.ts'
// 所有 kubectl 一律帶 --kubeconfig <practice>/.kube/config --context kind-learn-k8s，絕不讀學習者預設的 ~/.kube/config
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseAllDocuments } from 'yaml'

export const PRACTICE = join(import.meta.dirname, '..')
export const KUBECONFIG = join(PRACTICE, '.kube', 'config')
export const CLUSTER = 'learn-k8s'
export const CONTEXT = 'kind-learn-k8s'
export const SCHEMAS = join(PRACTICE, 'schemas')
export const K8S_VERSION = '1.37.0'
// 課程指令都從 learn/ 執行，訊息裡的路徑也從 learn/ 寫起
export const CLUSTER_CMD = 'node kubernetes/practice/bin/cluster.mjs'

export type Result = { code: number | null, stdout: string, stderr: string }
type RunOpts = { cwd?: string, env?: NodeJS.ProcessEnv, input?: string, timeout?: number }

// 執行外部指令，不丟例外：回傳結束碼與輸出。timeout 預設 120 秒，逾時 code 是 null
export function run(cmd: string, args: string[], opts: RunOpts = {}): Result {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024, ...opts, env: { ...process.env, ...opts.env } })
  return { code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() || (r.error ? String(r.error.message) : '') }
}

// 非同步版本：給「背景負載＋同時做別的事」用
export function runAsync(cmd: string, args: string[], opts: RunOpts = {}): Promise<Result> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => { stdout += d })
    p.stderr.on('data', d => { stderr += d })
    const timer = setTimeout(() => p.kill('SIGKILL'), opts.timeout ?? 600_000)
    if (opts.input !== undefined) p.stdin.end(opts.input)
    p.on('error', e => { stderr += e.message })
    p.on('close', code => { clearTimeout(timer); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }) })
  })
}

const kubeArgs = (args: string[]) => ['--kubeconfig', KUBECONFIG, '--context', CONTEXT, ...args]

// kubectl（課程叢集）。例：kube('get', 'pods', '-n', ns, '-o', 'json')
export const kube = (...args: string[]) => run('kubectl', kubeArgs(args))
// 把 input 交給 kubectl 的 stdin。例：kubeIn(yamlText, 'apply', '-n', ns, '-f', '-')（JSON 也可以）
export const kubeIn = (input: string, ...args: string[]) => run('kubectl', kubeArgs(args), { input })
export const kubeAsync = (args: string[], opts: RunOpts = {}) => runAsync('kubectl', kubeArgs(args), opts)

// kubectl ... -o json 並解析；失敗時丟出含 kubectl 錯誤訊息的 Error
export function kubeJson(...args: string[]): any {
  const r = kube(...args, '-o', 'json')
  if (r.code !== 0) throw new Error(`kubectl ${args.join(' ')} 失敗：${r.stderr}`)
  return JSON.parse(r.stdout)
}

// 學習者的腳本（bash）：KUBECONFIG 指向課程叢集，cwd 是題目資料夾
export function runScript(dir: string, script: string, args: string[] = [], opts: RunOpts = {}): Result {
  if (!existsSync(join(dir, script))) return { code: 127, stdout: '', stderr: `找不到 ${script}` }
  return run('bash', [script, ...args], { cwd: dir, timeout: 180_000, ...opts, env: { KUBECONFIG, ...opts.env } })
}
export function runScriptAsync(dir: string, script: string, args: string[] = [], opts: RunOpts = {}): Promise<Result> {
  return runAsync('bash', [script, ...args], { cwd: dir, ...opts, env: { KUBECONFIG, ...opts.env } })
}

// 需要叢集的測試檔在 before() 呼叫：缺什麼就丟出說明怎麼修的錯誤（整個檔案的測試都會顯示這段話）
export function requireCluster() {
  if (run('kubectl', ['version', '--client'], { timeout: 10_000 }).code !== 0)
    throw new Error('找不到 kubectl 指令：它隨 Docker Desktop 一起安裝。先安裝並打開 Docker Desktop，再開一個新的終端機視窗。')
  const d = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15_000 })
  if (d.code !== 0 || !d.stdout)
    throw new Error('Docker 沒有在跑：執行 docker desktop start（或打開 Docker Desktop），等 docker info 不再報錯後再試一次。')
  if (!existsSync(KUBECONFIG))
    throw new Error(`還沒有建立課程叢集：在 learn 資料夾執行 ${CLUSTER_CMD} up（第一次要下載約 1 GB 的映像，等它印出「叢集準備好了」）。`)
  const nodes = run('docker', ['ps', '--filter', `label=io.x-k8s.kind.cluster=${CLUSTER}`, '--format', '{{.Names}}'], { timeout: 15_000 })
  if (!nodes.stdout)
    throw new Error(`課程叢集的節點容器沒有在跑：執行 ${CLUSTER_CMD} start（如果顯示叢集不存在，改執行 ${CLUSTER_CMD} up）。`)
  const r = run('kubectl', kubeArgs(['get', 'nodes', '--request-timeout=10s', '-o', 'json']), { timeout: 20_000 })
  if (r.code !== 0)
    throw new Error(`連不上課程叢集的 API server：執行 ${CLUSTER_CMD} status 看哪裡有問題；剛 start 的話等 30 秒再試。\nkubectl：${r.stderr.split('\n')[0]}`)
  const notReady = JSON.parse(r.stdout).items.filter((n: any) => !n.status.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True'))
  if (notReady.length)
    throw new Error(`節點 ${notReady.map((n: any) => n.metadata.name).join('、')} 還沒 Ready：剛啟動的話等 30 秒再試，一直這樣就執行 ${CLUSTER_CMD} status。`)
}

// 第 N 課練習 M 的 namespace：k8s-<NN>-ex<M>，或加上後綴 k8s-<NN>-ex<M>-<suffix>
export const nsName = (lesson: number, ex: number, suffix = '') => `k8s-${String(lesson).padStart(2, '0')}-ex${ex}${suffix ? '-' + suffix : ''}`

// 刪掉（等它真的消失）再重建，帶上課程標籤；回傳 namespace 名稱。extraLabels 例如 { 'pod-security.kubernetes.io/enforce': 'restricted' }
export function freshNamespace(name: string, extraLabels: Record<string, string> = {}): string {
  deleteNamespace(name, true)
  const c = kube('create', 'namespace', name)
  if (c.code !== 0) throw new Error(`建立 namespace ${name} 失敗：${c.stderr}`)
  const task = name.split('-')[1]
  const labels = { 'learn.course': 'kubernetes', 'learn.task': task, ...extraLabels }
  const l = kube('label', 'namespace', name, '--overwrite', ...Object.entries(labels).map(([k, v]) => `${k}=${v}`))
  if (l.code !== 0) throw new Error(`替 namespace ${name} 加標籤失敗：${l.stderr}`)
  return name
}

// after() 用：wait=false 時不等它刪完（下次 freshNamespace 會等）
export function deleteNamespace(name: string, wait = false) {
  kube('delete', 'namespace', name, '--ignore-not-found', `--wait=${wait}`, '--timeout=120s')
}

// kubectl apply -n <ns> -f <dir 或檔案>（資料夾會遞迴），失敗時丟出含 kubectl 訊息的 Error
export function applyDir(path: string, ns: string, ...extra: string[]): string {
  if (!existsSync(path)) throw new Error(`找不到 ${path}`)
  const r = kube('apply', '-n', ns, '-R', '-f', path, ...extra)
  if (r.code !== 0) throw new Error(`kubectl apply 失敗，先用 kubectl apply --dry-run=server -f 檢查：\n${r.stderr}`)
  return r.stdout
}

// 每 intervalMs 呼叫 check 一次，回傳第一個 truthy 的結果；逾時丟出 message（加上最後一次的值或錯誤）
export async function waitFor<T>(check: () => T | Promise<T>, timeoutMs: number, message: string, intervalMs = 1000): Promise<NonNullable<T>> {
  const end = Date.now() + timeoutMs
  let last: unknown
  for (;;) {
    try {
      const v = await check()
      if (v) return v as NonNullable<T>
      last = v
    } catch (e) { last = (e as Error).message }
    if (Date.now() > end) throw new Error(`${message}（等了 ${Math.round(timeoutMs / 1000)} 秒）${last ? `\n最後一次：${typeof last === 'string' ? last : JSON.stringify(last)}` : ''}`)
    await sleep(intervalMs)
  }
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const isReady = (p: any) => p.metadata.deletionTimestamp == null && p.status?.conditions?.some((c: any) => c.type === 'Ready' && c.status === 'True')

// 等 selector 選到的 Pod 有 count 個 Ready（不算正在刪除的），回傳那些 Pod
export function waitPodsReady(ns: string, selector: string, count: number, timeoutMs = 120_000): Promise<any[]> {
  return waitFor(() => {
    const pods = kubeJson('get', 'pods', '-n', ns, '-l', selector).items
    const ready = pods.filter(isReady)
    return ready.length === count ? ready : (() => { throw new Error(podSummary(pods)) })()
  }, timeoutMs, `${ns} 裡 ${selector} 沒有在時間內變成 ${count} 個 Ready 的 Pod，用 kubectl get pods -n ${ns} 和 kubectl describe pod 看原因`)
}

// 一行一個 Pod 的狀態摘要（名稱、phase、Ready、等待原因、重啟次數），給錯誤訊息用
export function podSummary(pods: any[]): string {
  if (!pods.length) return '沒有任何 Pod'
  return pods.map(p => {
    const cs = [...(p.status?.initContainerStatuses ?? []), ...(p.status?.containerStatuses ?? [])]
    const why = cs.map((c: any) => c.state?.waiting?.reason ?? c.state?.terminated?.reason).filter(Boolean).join(',')
    const restarts = cs.reduce((n: number, c: any) => n + (c.restartCount ?? 0), 0)
    return `${p.metadata.name} ${p.status?.phase}${isReady(p) ? ' Ready' : ''}${why ? ' ' + why : ''} 重啟 ${restarts} 次`
  }).join('\n')
}

// 從 k8s-tools 的 probe Pod（curl）在叢集內發一個 HTTP 請求。連不上時 status 是 0、error 是 curl 的訊息
export function probe(url: string, opts: { method?: string, headers?: Record<string, string>, body?: string, timeoutSec?: number } = {}) {
  const args = ['exec', '-n', 'k8s-tools', 'deploy/probe', '--', 'curl', '-sS', '-i', '-m', String(opts.timeoutSec ?? 5), '-X', opts.method ?? 'GET']
  for (const [k, v] of Object.entries(opts.headers ?? {})) args.push('-H', `${k}: ${v}`)
  if (opts.body !== undefined) args.push('-H', 'content-type: application/json', '--data-binary', opts.body)
  const r = kube(...args, url)
  if (r.code !== 0) return { status: 0, headers: {} as Record<string, string>, body: '', error: r.stderr }
  // 只看最後一組回應（curl -i 遇到 100 Continue 會印兩組）
  const blocks = r.stdout.replace(/\r/g, '').split('\n\n')
  let i = 0
  while (i + 1 < blocks.length && /^HTTP\/\S+ 1\d\d/.test(blocks[i]) && /^HTTP\//.test(blocks[i + 1])) i++
  const [head, ...rest] = blocks.slice(i)
  const [statusLine, ...lines] = head.split('\n')
  const headers: Record<string, string> = {}
  for (const l of lines) { const j = l.indexOf(':'); if (j > 0) headers[l.slice(0, j).toLowerCase()] = l.slice(j + 1).trim() }
  return { status: Number(statusLine.split(' ')[1]), headers, body: rest.join('\n\n'), error: '' }
}

export type LoadResult = {
  requests: number, ok: number, errors: number, statuses: Record<string, number>,
  errorSamples: string[], instances: Record<string, number>, p50: number, p95: number, durationMs: number,
}
// 在 k8s-tools 的 loadgen Pod 以固定速率送 requests 個請求（每個請求新連線），回傳統計。
// urls 可以給好幾個，輪流使用（例如一般請求和 /slow 混著送）。「錯誤」= 連線錯誤或 5xx
export async function load(urls: string | string[], opts: { requests: number, rps: number, method?: string, headers?: Record<string, string>, body?: string, timeoutMs?: number }): Promise<LoadResult> {
  const spec = JSON.stringify({ urls: [urls].flat(), ...opts })
  const r = await kubeAsync(['exec', '-n', 'k8s-tools', 'deploy/loadgen', '--', 'node', '/loadgen/loadgen.mjs', spec],
    { timeout: Math.ceil(opts.requests / opts.rps) * 1000 + 120_000 })
  if (r.code !== 0) throw new Error(`loadgen 執行失敗：${r.stderr || r.stdout}`)
  return JSON.parse(r.stdout)
}

// kubeconform（strict、Kubernetes 1.37.0、只用 schemas/ 裡的離線 schema）。paths 是檔案或資料夾；stdin 給 '-' 並傳 input
export function kubeconform(paths: string[], input?: string): { ok: boolean, message: string } {
  const r = run('kubeconform', ['-strict', '-summary', '-kubernetes-version', K8S_VERSION,
    '-schema-location', join(SCHEMAS, '{{.NormalizedKubernetesVersion}}-standalone{{.StrictSuffix}}/{{.ResourceKind}}{{.KindSuffix}}.json'),
    '-schema-location', join(SCHEMAS, 'crds/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'),
    ...paths], { input, timeout: 30_000 })
  if (r.code === null && /ENOENT/.test(r.stderr)) throw new Error('找不到 kubeconform：執行 brew install kubeconform')
  return { ok: r.code === 0, message: (r.stdout + '\n' + r.stderr).trim() }
}

// helm template（不連叢集）。回傳 Result；成功時用 parseYaml(r.stdout) 解析
export function helmTemplate(chartDir: string, opts: { release?: string, namespace?: string, values?: string[], set?: Record<string, string> } = {}): Result {
  const args = ['template', opts.release ?? 'cafe', chartDir, '--namespace', opts.namespace ?? 'default', '--kube-version', K8S_VERSION]
  for (const f of opts.values ?? []) args.push('-f', f)
  for (const [k, v] of Object.entries(opts.set ?? {})) args.push('--set', `${k}=${v}`)
  return run('helm', args, { timeout: 30_000 })
}

// 解析多文件 YAML，回傳非空的物件陣列；語法錯誤時丟出含行號的 Error
export function parseYaml(text: string, file = 'YAML'): any[] {
  const docs = parseAllDocuments(text)
  for (const d of docs) if (d.errors.length) throw new Error(`${file} 不是合法的 YAML：${d.errors[0].message}`)
  return docs.map(d => d.toJS()).filter(Boolean)
}

// 讀題目資料夾裡的 YAML 檔並解析
export function readYaml(dir: string, file: string): any[] {
  return parseYaml(readText(dir, file), file)
}

// 讀學習者寫的檔案，不存在時給清楚的訊息
export function readText(dir: string, file: string): string {
  try { return readFileSync(join(dir, file), 'utf8') } catch { throw new Error(`找不到 ${file}：在這一題的資料夾裡建立它`) }
}
export function readJson(dir: string, file: string): any {
  const text = readText(dir, file)
  try { return JSON.parse(text) } catch (e) { throw new Error(`${file} 不是合法的 JSON：${(e as Error).message}`) }
}

// 從 Dockerfile 所在資料夾建置映像並載入課程叢集（第 10、14、16 課自己的映像用）。tag 例如 learn-k8s/cafe-migrate:v1
export function buildImage(contextDir: string, tag: string, opts: BuildOpts = {}) {
  dockerBuild(contextDir, tag, opts)
  kindLoad(tag)
}

type BuildOpts = { target?: string, buildArgs?: Record<string, string>, dockerfile?: string }
// docker build 成單一平台（跟主機相同）的映像：kind 節點跟主機同平台，多平台 index 在 kind load 時可能失敗
export function dockerBuild(contextDir: string, tag: string, opts: BuildOpts = {}) {
  const args = ['build', '--platform', `linux/${process.arch === 'arm64' ? 'arm64' : 'amd64'}`, '-t', tag, '-q']
  if (opts.dockerfile) args.push('-f', opts.dockerfile)
  if (opts.target) args.push('--target', opts.target)
  for (const [k, v] of Object.entries(opts.buildArgs ?? {})) args.push('--build-arg', `${k}=${v}`)
  const b = run('docker', [...args, contextDir], { timeout: 600_000 })
  if (b.code !== 0) throw new Error(`建置 ${tag} 失敗：${b.stderr}`)
}

// 把主機上的映像載入每個節點（節點上已經有同一個映像 ID 時 kind 會跳過）。一次給多個 tag 比較快：共用的 layer 只傳一次
export function kindLoad(...tags: string[]) {
  const l = run('kind', ['load', 'docker-image', ...tags, '--name', CLUSTER], { timeout: 900_000 })
  if (l.code !== 0) throw new Error(`kind load ${tags.join(' ')} 失敗：${l.stderr}`)
}

// 監看學習者的腳本呼叫了哪些 kubectl：在 PATH 最前面放一個會記錄參數再轉給真的 kubectl 的 kubectl。
// 用法：const spy = spyKubectl(); runScript(dir, 'x.sh', [], { env: spy.env }); spy.calls() → [['get','nodes'], …]；用完 spy.cleanup()
export function spyKubectl() {
  const real = run('bash', ['-c', 'command -v kubectl']).stdout
  if (!real) throw new Error('找不到 kubectl')
  const dir = mkdtempSync(join(tmpdir(), 'learn-k8s-spy-'))
  const log = join(dir, 'calls.jsonl')
  writeFileSync(join(dir, 'kubectl'), `#!/bin/bash\nnode -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)) + "\\n")' "${log}" "$@"\nexec "${real}" "$@"\n`, { mode: 0o755 })
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

const VALUE_FLAGS = new Set(['-n', '--namespace', '--context', '--kubeconfig', '-o', '--output', '-l', '--selector', '-f', '--filename', '-c', '--container', '--field-selector', '--sort-by', '--cluster', '--user', '--server', '-s', '--request-timeout'])
// kubectl 參數裡的子指令（去掉全域旗標），例如 ['--context','x','config','use-context','y'] → ['config', 'use-context']
export function kubectlVerb(args: string[]): string[] {
  const words: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) { i++; continue }
    if (args[i].startsWith('-')) continue
    words.push(args[i])
  }
  return words[0] === 'config' || words[0] === 'rollout' || words[0] === 'auth' ? words.slice(0, 2) : words.slice(0, 1)
}
// 會改變叢集或 kubeconfig 的 kubectl 子指令
export const MUTATING = new Set(['apply', 'create', 'delete', 'edit', 'patch', 'replace', 'scale', 'autoscale', 'label', 'annotate', 'set', 'expose', 'run',
  'cordon', 'uncordon', 'drain', 'taint', 'rollout restart', 'rollout undo', 'rollout pause', 'rollout resume', 'debug', 'exec', 'cp', 'attach', 'port-forward',
  'config use-context', 'config set-context', 'config set-cluster', 'config set-credentials', 'config set', 'config unset', 'config delete-context', 'config delete-cluster', 'config rename-context'])
export const isMutating = (args: string[]) => MUTATING.has(kubectlVerb(args).join(' '))
