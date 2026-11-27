// 練習 2、3 的測試共用：一個練習用的 PostgreSQL 容器（ld-17-pg，發布在 127.0.0.1 上由 Docker 挑的 port），每個測試建自己的資料庫。不要改這個檔
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { docker, removeContainers, requireDocker } from '../../helpers/docker.ts'

export const NAME = 'ld-17-pg'
const PASS = randomBytes(12).toString('hex')
// 不用固定 port：Docker Desktop 偶爾會留著前一個容器的 port 轉送，新容器綁同一個 port 時連不到
let port = ''
export const url = (db: string) => `postgres://postgres:${PASS}@127.0.0.1:${port}/${db}`
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function startPg() {
  requireDocker()
  removeContainers(NAME)
  const r = docker('run', '-d', '--name', NAME, '-e', `POSTGRES_PASSWORD=${PASS}`, '-p', '127.0.0.1::5432', 'postgres:18.6-alpine3.24')
  if (r.code !== 0) throw new Error(`啟動練習用的 PostgreSQL 失敗：${r.stderr}`)
  port = docker('port', NAME, '5432/tcp').stdout.split('\n')[0].split(':').pop()!
  if (!port) throw new Error(`找不到 ${NAME} 發布的 port：docker port ${NAME}`)
  const end = Date.now() + 300_000
  for (;;) {
    // 走 TCP 檢查：初始化時的暫時伺服器只聽 Unix socket，不會被誤認為好了
    if (docker('exec', NAME, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres').code === 0) {
      try { await admin('SELECT 1'); return } catch {}
    }
    if (Date.now() > end) throw new Error(`PostgreSQL 300 秒內沒有準備好：docker logs ${NAME}`)
    await sleep(500)
  }
}
export const stopPg = () => removeContainers(NAME)

// 在 db 資料庫執行一句 SQL（用超級使用者，只給測試用）
export async function admin(sql: string, db = 'postgres', params: unknown[] = []) {
  const c = new pg.Client({ connectionString: url(db) })
  await c.connect()
  try { return await c.query(sql, params) } finally { await c.end() }
}

export async function freshDb(name: string) {
  await admin(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
  await admin(`CREATE DATABASE ${name}`)
  return url(name)
}

// 非同步執行外部指令（測試同時還要模擬 app 的流量，不能用會卡住整個程序的 spawnSync）
// onLine：每印一行 stdout 就呼叫一次，回傳 true 時用 SIGKILL 中斷它
export function exec(cmd: string, args: string[], opts: { cwd: string, env: NodeJS.ProcessEnv, timeout: number, onLine?: (line: string) => boolean | void }) {
  return new Promise<{ code: number | null, signal: string | null, stdout: string, stderr: string, ms: number }>(resolve => {
    const started = Date.now()
    // detached：自己一個程序群組，中斷時連 sh 底下的 npx、node 一起殺掉，不會留下還拿著連線的孤兒程序
    const p = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env }, detached: true })
    const kill = () => { try { process.kill(-p.pid!, 'SIGKILL') } catch {} }
    let stdout = '', stderr = '', buf = ''
    const timer = setTimeout(kill, opts.timeout)
    p.stdout.on('data', d => {
      stdout += d
      buf += d
      const lines = buf.split('\n')
      buf = lines.pop()!
      for (const line of lines) if (line.trim() && opts.onLine?.(line)) kill()
    })
    p.stderr.on('data', d => stderr += d)
    p.on('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout: stdout.trim(), stderr: stderr.trim(), ms: Date.now() - started }) })
  })
}
