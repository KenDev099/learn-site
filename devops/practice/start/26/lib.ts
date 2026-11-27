// 第 26 課測試共用的工具（不是測試檔，不用改）
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run, type Result } from '../../helpers/docker.ts'

export const HTTPS = 'https://localhost:18263'
export const HTTP = 'http://localhost:18260'
export const NETWORK = 'ld-26_default'

export const dc = (dir: string, ...args: string[]) => run('docker', ['compose', '-f', 'compose.prod.yaml', ...args], { cwd: dir, timeout: 300_000 })

// 收掉整套環境，刪掉上一次留下的部署狀態（.env、secrets/），active.conf 指回 blue。你寫的檔案都不動
export function reset(dir: string) {
  run('docker', ['rm', '-f', '-v', 'ld-26-k6'])
  if (existsSync(join(dir, 'compose.prod.yaml'))) dc(dir, 'down', '-v', '--remove-orphans', '--timeout', '3')
  run('docker', ['rm', '-f', '-v', ...run('docker', ['ps', '-aq', '--filter', 'label=com.docker.compose.project=ld-26']).stdout.split('\n').filter(Boolean)])
  run('docker', ['volume', 'rm', '-f', 'ld-26_pgdata'])
  rmSync(join(dir, '.env'), { force: true })
  rmSync(join(dir, 'secrets'), { recursive: true, force: true })
  writeFileSync(join(dir, 'nginx', 'active.conf'), `# 現在接流量的顏色。deploy.sh 與 rollback.sh 改寫這個檔，再 nginx -t、nginx -s reload
upstream api {
    zone api 64k;
    resolver 127.0.0.11 valid=5s ipv6=off;
    server api-blue:3000 resolve max_fails=2 fail_timeout=5s;
}
`)
}

// sh up.sh：憑證、密碼、1.0.0 的映像、.env，然後 compose up --wait
export function up(dir: string): Result {
  return run('sh', ['up.sh'], { cwd: dir, timeout: 600_000 })
}

// 用你的 Dockerfile 建置新版本：app/ 加上一個 migration
// 2.0.0：訂單加上集點欄位（向後相容，1.0.0 照常運作），新版本的 readiness 要等它套用
// 2.1.0：跟 2.0.0 一樣的 migration，只有版本號不同（模擬下一次的一般部署）
// 3.0.0：migration 會失敗（查一張不存在的表），deploy.sh 要停下來、不切流量
export function release(dir: string, version: '2.0.0' | '2.1.0' | '3.0.0'): Result {
  const tmp = mkdtempSync(join(tmpdir(), `ld-26-${version}-`))
  try {
    cpSync(join(dir, 'app'), tmp, { recursive: true, filter: s => !/node_modules|dist/.test(s.slice(join(dir, 'app').length)) })
    writeFileSync(join(tmp, 'migrations', '002_loyalty.sql'), '-- Up Migration\nALTER TABLE orders ADD COLUMN loyalty_points integer;\n\n-- Down Migration\nALTER TABLE orders DROP COLUMN loyalty_points;\n')
    if (version === '3.0.0') writeFileSync(join(tmp, 'migrations', '003_broken.sql'), '-- Up Migration\nUPDATE no_such_table SET x = 1;\n\n-- Down Migration\nSELECT 1;\n')
    return run('sh', ['release.sh', version, tmp], { cwd: dir, timeout: 600_000 })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

export const psql = (dir: string, sql: string) => dc(dir, 'exec', '-T', 'db', 'psql', '-XAtq', '-U', 'postgres', '-d', 'cafe', '-c', sql)
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const tail = (s: string, n = 12) => s.split('\n').slice(-n).join('\n')

// 跟 helpers 的 run() 一樣，但不卡住事件迴圈：腳本執行期間，背景的負載還能繼續送
export function runAsync(cmd: string, args: string[], opts: { cwd?: string, env?: NodeJS.ProcessEnv, timeout?: number } = {}): Promise<Result> {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env } })
    let stdout = '', stderr = ''
    p.stdout.on('data', d => { stdout += d })
    p.stderr.on('data', d => { stderr += d })
    const t = setTimeout(() => p.kill('SIGKILL'), opts.timeout ?? 180_000)
    p.on('close', code => { clearTimeout(t); resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }) })
  })
}

export type Reply = { status: number, headers: Record<string, string>, body: string }
let ca: Buffer | undefined
// 一個請求，每次開新連線。https 用 certs/ca.crt 驗證憑證（不是關掉驗證）
export function hit(dir: string, url: string, init: { method?: string, body?: string | Buffer, headers?: Record<string, string> } = {}): Promise<Reply> {
  const secure = url.startsWith('https:')
  if (secure && !ca) ca = readFileSync(join(dir, 'certs', 'ca.crt'))
  const request = secure ? httpsRequest : httpRequest
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', agent: false, timeout: 15_000, headers: init.headers, ...(secure ? { ca } : {}) }, res => {
      let body = ''
      res.on('data', d => { body += d })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, body }))
      res.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('15 秒沒有回應')))
    req.on('error', reject)
    req.end(init.body)
  })
}

// 持續負載：每秒約 rps 個請求，經過 nginx 的 HTTPS；GET /products 與 POST /orders 輪流，記下每個失敗
export function load(dir: string, rps = 20) {
  const failures: string[] = []
  const t0 = Date.now()
  let sent = 0
  const pending = new Set<Promise<void>>()
  const at = () => `第 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`
  const one = (i: number) => {
    const post = i % 2 === 1
    const what = post ? 'POST /orders' : 'GET /products'
    const p = hit(dir, HTTPS + (post ? '/orders' : '/products'), post
      ? { method: 'POST', body: JSON.stringify({ productId: 2, quantity: 1 }), headers: { 'content-type': 'application/json' } } : {})
      .then(r => { if (r.status >= 400) failures.push(`${at()} ${what} → ${r.status}`) }, e => { failures.push(`${at()} ${what} → ${(e as Error).message}`) })
      .finally(() => pending.delete(p))
    pending.add(p)
  }
  const timer = setInterval(() => one(sent++), 1000 / rps)
  return { failures, at, get sent() { return sent }, async stop() { clearInterval(timer); await Promise.all(pending) } }
}

export async function version(dir: string): Promise<string> {
  try { return JSON.parse((await hit(dir, HTTPS + '/version')).body).version } catch (e) { return `（連不上：${(e as Error).message}）` }
}

// 指令失敗時給人看的訊息：先列出含錯誤字眼的行，再附上最後幾行
export function why(r: Result): string {
  const all = (r.stdout + '\n' + r.stderr).split('\n').filter(Boolean)
  const errors = all.filter(l => /error|fail|unhealthy|denied|no such|invalid/i.test(l))
  return [...new Set([...errors.slice(-8), ...all.slice(-6)])].join('\n')
}
