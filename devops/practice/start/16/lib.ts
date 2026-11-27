// 第 16 課測試共用的工具（不是測試檔，不用改）
import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { run, type Result } from '../../helpers/docker.ts'

export const REGISTRY = 'localhost:18160'

// 只用 repo 自己的 git 設定：不讀你的 ~/.gitconfig；GIT_CEILING_DIRECTORIES 讓 git 不會往上找到 learn/ 本身的 repo
export const gitEnv = (dir: string) => ({
  GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
  GIT_CEILING_DIRECTORIES: dir, GIT_DIR: undefined, GIT_WORK_TREE: undefined, LC_ALL: 'C',
} as NodeJS.ProcessEnv)

// 跟 helpers 的 run() 一樣，但不卡住事件迴圈：腳本執行期間，背景的負載產生器還能繼續送請求
export function runAsync(cmd: string, args: string[], opts: { cwd?: string, env?: NodeJS.ProcessEnv, timeout?: number } = {}): Promise<Result> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => { stdout += d })
    p.stderr.on('data', d => { stderr += d })
    const t = setTimeout(() => p.kill('SIGKILL'), opts.timeout ?? 120_000)
    p.on('close', code => { clearTimeout(t); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }) })
  })
}

// 啟動一個全新的本機 registry（127.0.0.1:18160），內容是空的
export async function startRegistry() {
  run('docker', ['rm', '-f', '-v', 'ld-16-registry'])
  const r = run('docker', ['run', '-d', '--name', 'ld-16-registry', '-p', '127.0.0.1:18160:5000', 'registry:3.1.2'], { timeout: 180_000 })
  if (r.code !== 0) throw new Error(`registry 啟動失敗（127.0.0.1:18160 被占用了嗎？）：${r.stderr}`)
  const end = Date.now() + 30_000
  while (Date.now() < end) {
    try { if ((await fetch(`http://${REGISTRY}/v2/`)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 300))
  }
  throw new Error('registry 30 秒內沒有回應：docker logs ld-16-registry')
}

// 直接問 registry：某個 tag 現在指向哪個 digest（不存在回傳 null）
export async function registryDigest(repo: string, tag: string): Promise<string | null> {
  const res = await fetch(`http://${REGISTRY}/v2/${repo}/manifests/${tag}`, {
    method: 'HEAD',
    headers: { accept: ['application/vnd.oci.image.index.v1+json', 'application/vnd.oci.image.manifest.v1+json',
      'application/vnd.docker.distribution.manifest.list.v2+json', 'application/vnd.docker.distribution.manifest.v2+json'].join(', ') },
  })
  return res.ok ? res.headers.get('docker-content-digest') : null
}

export async function registryTags(repo: string): Promise<string[]> {
  const res = await fetch(`http://${REGISTRY}/v2/${repo}/tags/list`)
  return res.ok ? ((await res.json()).tags ?? []).sort() : []
}

// 一個請求：每次開新連線（agent: false），測試端自己不會有 keep-alive 的競態
export function hit(url: string, init: { method?: string, body?: string, headers?: Record<string, string> } = {}): Promise<{ status: number, body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', agent: false, timeout: 5_000, headers: init.headers }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('5 秒沒有回應')))
    req.on('error', reject)
    req.end(init.body)
  })
}

// 持續負載：每秒約 rps 個請求，GET /products 與 POST /orders 輪流；記下每個失敗（狀態 ≥ 400 或連線錯誤）
export function load(base: string, rps = 30) {
  const failures: string[] = []
  let sent = 0
  const pending = new Set<Promise<void>>()
  const one = (i: number) => {
    const post = i % 2 === 1
    const started = Date.now()
    const p = hit(base + (post ? '/orders' : '/products'), post
      ? { method: 'POST', body: JSON.stringify({ productId: 2, quantity: 1 }), headers: { 'content-type': 'application/json' } }
      : {})
      .then(r => { if (r.status >= 400) failures.push(`${post ? 'POST /orders' : 'GET /products'} → ${r.status}`) },
        e => { failures.push(`${post ? 'POST /orders' : 'GET /products'} → ${(e as Error).message}（${Date.now() - started}ms）`) })
      .finally(() => pending.delete(p))
    pending.add(p)
  }
  const timer = setInterval(() => one(sent++), 1000 / rps)
  return {
    failures,
    get sent() { return sent },
    async stop() { clearInterval(timer); await Promise.all(pending) },
  }
}

// 等到經過 nginx 的 /version 變成 want，回傳花了幾毫秒；逾時回傳 null
export async function waitVersion(base: string, want: string, timeoutMs: number): Promise<number | null> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { if (JSON.parse((await hit(base + '/version')).body).version === want) return Date.now() - start } catch {}
    await new Promise(r => setTimeout(r, 50))
  }
  return null
}

export async function version(base: string): Promise<string> {
  try { return JSON.parse((await hit(base + '/version')).body).version } catch (e) { return `（連不上：${(e as Error).message}）` }
}
