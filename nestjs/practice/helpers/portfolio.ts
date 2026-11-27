// 作品專案課（portfolio）的驗收測試共用：測試對「啟動中的 API」打 HTTP，不 import 學習者的程式
//   const t = await target(import.meta.dirname, 'saas')   // 放在測試檔最上層（top-level await）
//   const t = await target(import.meta.dirname, 'small', { http: false })   // 只看 repo 的檔案：不啟動、不連 API
//   const owner = await signupTenant(t, 'owner')
//   const res = await call(t, 'GET', '/api/v1/me', { token: owner.token })
//   expectError(res, 404, 'NOT_FOUND')
// 測的是誰：
//   work/pfNN/（學習者）：讀 work/portfolio.json（環境變數 PF_SMALL_API、PF_SAAS_API… 優先），打學習者自己啟動的 API
//   verify/pfNN-…/（出題檢查）：prepare.mjs 已經把 portfolio-ref/<ref>/ 組進資料夾；這裡 nest build、啟動、測完關掉
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, expect } from 'vitest'
import { build, start } from './server.ts'
import { taskSlug } from './task.ts'

export type BolaProbe = { name: string; create: { path: string; body: unknown }; item: string; update: { body: unknown } }
export type Target = {
  api: string                  // 例如 http://localhost:3100（結尾沒有 /）
  repo: string                 // 學習者 repo 的絕對路徑（出題檢查時是 verify 資料夾）
  mailpit: string              // Mailpit 網頁／API
  appDatabaseUrl?: string      // 應用程式執行時用的資料庫角色（第 9、11 課的灰箱測試）
  bolaProbes: BolaProbe[]      // 第 18 課
  composeApi?: string          // 第 4 課：用 docker compose 啟動的 API
  deployUrl?: string           // 第 5、17 課（選做）
  verify: boolean              // true：出題檢查（參考實作）
}
type Kind = 'small' | 'saas'

const practice = join(import.meta.dirname, '..')
const CONFIG = join(practice, 'work', 'portfolio.json')
const TEMPLATE = {
  small: { api: 'http://localhost:3000', repo: '/絕對路徑/event-signup' },
  saas: { api: 'http://localhost:3100', repo: '/絕對路徑/my-saas', mailpit: 'http://localhost:8026',
    appDatabaseUrl: 'postgresql://app_user:密碼@localhost:5434/my_saas', bolaProbes: [] },
}

export async function target(testDir: string, kind: Kind, { http = true } = {}): Promise<Target> {
  if (basename(join(testDir, '..')) === 'verify') return referenceTarget(testDir, http)
  return readerTarget(kind, http)
}

async function referenceTarget(dir: string, http: boolean): Promise<Target> {
  if (!existsSync(join(dir, 'src', 'main.ts'))) throw new Error('沒有可測的實作：這個資料夾沒有 src/main.ts')
  if (!http) return { api: '', repo: dir, mailpit: '', bolaProbes: [], verify: true }
  if (!existsSync(join(dir, 'dist', 'main.js'))) build(dir)
  const slug = taskSlug(dir)
  const db = new URL(process.env.DATABASE_URL!)
  db.username = 'pf_app'
  db.password = 'pf_app'
  const appDatabaseUrl = db.href
  const server = await start(dir, { timeout: 30_000, env: {
    APP_DATABASE_URL: appDatabaseUrl,
    APP_URL: 'http://app.example.test',
    SMTP_URL: 'smtp://127.0.0.1:1026',
    STORAGE_DIR: join(tmpdir(), `learn-pf-${slug}`),
    NODE_ENV: 'test',
  } })
  afterAll(() => server.stop())
  return { api: server.url, repo: dir, mailpit: 'http://127.0.0.1:8026', appDatabaseUrl, bolaProbes: REF_PROBES, verify: true }
}

// 參考實作登記的探針：示範模組 projects 與 files 的 metadata（第 18 課）
const REF_PROBES: BolaProbe[] = [
  { name: 'projects', create: { path: '/api/v1/projects', body: { name: '探針' } }, item: '/api/v1/projects/:id', update: { body: { name: '改' } } },
  { name: 'tags', create: { path: '/api/v1/tags', body: { name: '探針' } }, item: '/api/v1/tags/:id', update: { body: { name: '改' } } },
]

async function readerTarget(kind: Kind, http: boolean): Promise<Target> {
  if (!existsSync(CONFIG)) {
    writeFileSync(CONFIG, JSON.stringify(TEMPLATE, null, 2) + '\n')
    throw new Error(`已建立 nestjs/practice/work/portfolio.json：填上你的 API 網址與 repo 的絕對路徑（${kind} 區段），再執行一次。`)
  }
  let file: Record<string, Record<string, unknown>>
  try { file = JSON.parse(readFileSync(CONFIG, 'utf8')) } catch (e) { throw new Error(`nestjs/practice/work/portfolio.json 不是合法的 JSON：${(e as Error).message}`) }
  const c = { ...file[kind] }
  const env = (k: string) => process.env[`PF_${kind.toUpperCase()}_${k}`]
  for (const [key, name] of [['api', 'API'], ['repo', 'REPO'], ['mailpit', 'MAILPIT'], ['appDatabaseUrl', 'APP_DATABASE_URL'], ['composeApi', 'COMPOSE_API'], ['deployUrl', 'DEPLOY_URL']]) {
    if (env(name)) c[key] = env(name)
  }
  if (typeof c.api !== 'string' || typeof c.repo !== 'string') throw new Error(`work/portfolio.json 的 ${kind} 區段要有 api 與 repo`)
  if (c.repo.startsWith('/絕對路徑')) throw new Error(`先打開 nestjs/practice/work/portfolio.json，把 ${kind}.repo 改成你的 repo 的絕對路徑（在 repo 裡執行 pwd）、${kind}.api 改成你的 API 網址`)
  if (!existsSync(c.repo)) throw new Error(`work/portfolio.json 的 ${kind}.repo 找不到：${c.repo}（要填 repo 的絕對路徑）`)
  const api = c.api.replace(/\/+$/, '')
  if (http) try {
    await fetch(`${api}/health/live`, { signal: AbortSignal.timeout(3000) })
  } catch {
    throw new Error(`連不到 ${api}：先在你的專案執行 npm run start:dev，或改 work/portfolio.json 的 ${kind}.api`)
  }
  return {
    api, repo: c.repo, mailpit: String(c.mailpit ?? 'http://localhost:8026').replace(/\/+$/, ''),
    appDatabaseUrl: c.appDatabaseUrl as string | undefined, bolaProbes: (c.bolaProbes as BolaProbe[]) ?? [],
    composeApi: c.composeApi as string | undefined, deployUrl: c.deployUrl as string | undefined, verify: false,
  }
}

// 每次執行不同的名字：資料留在學習者的資料庫也不會撞到（只用在命名，不影響判定）
let seq = 0
export const RUN = Date.now().toString(36) + process.pid.toString(36)
export const runId = () => `${RUN}${(seq++).toString(36)}`
export const email = (role: string) => `pf-${runId()}-${role}@example.test`
export const PASSWORD = 'portfolio-pass-2026'

export type Res = { status: number; body: any; text: string; headers: Headers }
type CallOptions = { token?: string; body?: unknown; headers?: Record<string, string>; cookie?: string; raw?: BodyInit; redirect?: RequestRedirect }

// 打一個請求：body 是物件就送 JSON；回應是 JSON 就解析成 body
export async function call(t: Pick<Target, 'api'>, method: string, path: string, o: CallOptions = {}): Promise<Res> {
  const headers: Record<string, string> = { ...o.headers }
  if (o.token) headers.authorization = `Bearer ${o.token}`
  if (o.cookie) headers.cookie = o.cookie
  if (o.body !== undefined) headers['content-type'] ??= 'application/json'
  const res = await fetch(t.api + path, { method, headers, body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)), redirect: o.redirect ?? 'manual' })
  const text = await res.text()
  let body: any = text
  try { body = text ? JSON.parse(text) : null } catch {}
  return { status: res.status, body, text, headers: res.headers }
}

// 錯誤回應：狀態碼與 errorCode（契約不規定 message 的文字）
export function expectError(res: Res, status: number, code: string, what = '') {
  const got = `${res.status} ${res.body?.errorCode ?? ''}`
  expect(res.status, `${what}要回 ${status} ${code}，實際是 ${got}：${res.text.slice(0, 200)}`).toBe(status)
  expect(res.body?.errorCode, `${what}的 errorCode 要是 ${code}，實際是 ${res.body?.errorCode}`).toBe(code)
}

// Set-Cookie 只留「名稱=值」，下一個請求放進 cookie 標頭
export const cookieOf = (res: Res) => res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')

export type Account = { email: string; password: string; token: string; cookie: string; userId: string; tenantId: string; tenantName: string }

// 註冊一個新租戶（自己是 owner）並登入
export async function signupTenant(t: Target, role = 'owner'): Promise<Account> {
  const e = email(role), tenantName = `租戶 ${runId()}`
  const res = await call(t, 'POST', '/api/v1/auth/signup', { body: { email: e, password: PASSWORD, name: `測試 ${role}`, tenantName } })
  expect(res.status, `POST /api/v1/auth/signup 要回 201：${res.text.slice(0, 200)}`).toBe(201)
  return login(t, e, PASSWORD, tenantName)
}

export async function login(t: Target, e: string, password = PASSWORD, tenantName = ''): Promise<Account> {
  const res = await call(t, 'POST', '/api/v1/auth/login', { body: { email: e, password } })
  expect(res.status, `POST /api/v1/auth/login 要回 200：${res.text.slice(0, 200)}`).toBe(200)
  expect(typeof res.body?.accessToken, '登入的回應要有 accessToken').toBe('string')
  const me = await call(t, 'GET', '/api/v1/me', { token: res.body.accessToken })
  expect(me.status, `GET /api/v1/me 要回 200：${me.text.slice(0, 200)}`).toBe(200)
  return { email: e, password, token: res.body.accessToken, cookie: cookieOf(res), userId: me.body.user.id, tenantId: me.body.tenant.id, tenantName: tenantName || me.body.tenant.name }
}

export async function pollUntil<T>(fn: () => Promise<T | undefined | null | false>, { timeout = 15_000, interval = 250, what = '條件' } = {}): Promise<T> {
  const deadline = Date.now() + timeout
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > deadline) throw new Error(`等了 ${timeout / 1000} 秒，${what}還沒成立`)
    await new Promise(r => setTimeout(r, interval))
  }
}

// 從 Mailpit 找寄給 to 的最新一封信，回傳信裡第一個網址
export async function mailpitLink(t: Target, to: string, { timeout = 10_000 } = {}): Promise<string> {
  const query = encodeURIComponent(`to:"${to}"`)
  const id = await pollUntil(async () => {
    const r = await fetch(`${t.mailpit}/api/v1/search?query=${query}`).catch(() => null)
    if (!r?.ok) throw new Error(`連不到 Mailpit（${t.mailpit}）：在 learn/nestjs/practice 執行 docker compose up -d --wait，或改 work/portfolio.json 的 saas.mailpit`)
    return ((await r.json()) as { messages: { ID: string }[] }).messages[0]?.ID
  }, { timeout, what: `寄給 ${to} 的信` })
  const msg = await (await fetch(`${t.mailpit}/api/v1/message/${id}`)).json() as { Text: string; HTML: string }
  const url = (msg.Text || msg.HTML).match(/https?:\/\/[^\s"'<>]+/)?.[0]
  if (!url) throw new Error(`寄給 ${to} 的信裡沒有網址`)
  return url.replace(/&amp;/g, '&')
}

// 讀學習者 repo 裡的檔案；不存在回 null
export const repoFile = (t: Pick<Target, 'repo'>, rel: string) => {
  const p = join(t.repo, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : null
}

// 邀請一個新帳號加入 owner 的租戶並登入（第 10 課起）：POST /invitations → Mailpit 的連結 → accept → login
export async function addMember(t: Target, inviter: Account, role: 'admin' | 'member' | 'viewer' | 'owner'): Promise<Account> {
  const e = email(role)
  const inv = await call(t, 'POST', '/api/v1/invitations', { token: inviter.token, body: { email: e, role } })
  expect(inv.status, `POST /api/v1/invitations（${role}）要回 201：${inv.text.slice(0, 200)}`).toBe(201)
  const token = new URL(await mailpitLink(t, e)).searchParams.get('token')
  expect(token, '邀請信的連結要帶 ?token=…').toBeTruthy()
  const acc = await call(t, 'POST', '/api/v1/auth/invitations/accept', { body: { token, name: `測試 ${role}`, password: PASSWORD } })
  expect(acc.status, `POST /api/v1/auth/invitations/accept 要回 200：${acc.text.slice(0, 200)}`).toBe(200)
  return login(t, e)
}

// 同時最多 n 個請求，總共 total 個（一次開幾百條連線，macOS 的 listen backlog 會直接重設連線）
export async function concurrent<T>(n: number, total: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = []
  let next = 0
  await Promise.all(Array.from({ length: Math.min(n, total) }, async () => {
    while (next < total) { const i = next++; out[i] = await fn(i) }
  }))
  return out
}
