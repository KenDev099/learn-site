// Supabase 課的測試共用工具。題目資料夾都是兩層（work/<題號>/、verify/<題號>-<pid>-<label>/），所以 import '../../helpers/supa.ts'
// 課程的本機 Supabase 只有一套（project_id learn-supabase，API 55421、DB 55422），好幾個人同時判分時：
//   public 的咖啡店四張表只讀不寫；要建表、寫 policy、寫資料的題用 taskSchema(dir) 拿到自己專屬的 schema t_<slug>
import { spawnSync } from 'node:child_process'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, dirname, join } from 'node:path'
import pg from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const PRACTICE = join(import.meta.dirname, '..')
const CLI = join(PRACTICE, 'node_modules', '.bin', 'supabase')
// 課程指令都從 learn/ 執行，訊息裡的指令也從 learn/ 寫起
export const UP_CMD = 'npm --prefix supabase/practice run up'

export type Stack = { API_URL: string, DB_URL: string, PUBLISHABLE_KEY: string, SECRET_KEY: string, MAILPIT_URL: string, STUDIO_URL: string, [k: string]: string }

let cached: Stack | undefined
// supabase status -o json 的內容（網址與 key 每次即時讀，不寫死）。stack 沒在跑時丟出怎麼修的錯誤
export function stack(): Stack {
  if (cached) return cached
  const r = spawnSync(CLI, ['status', '--workdir', PRACTICE, '-o', 'json', '--agent', 'no'], { encoding: 'utf8', timeout: 60_000 })
  if (r.error) throw new Error(`找不到課程的 Supabase CLI：在 learn 資料夾執行 npm --prefix supabase/practice ci\n${r.error.message}`)
  if (r.status !== 0) throw new Error(`課程的本機 Supabase 沒有在跑：在 learn 資料夾執行 ${UP_CMD}（Docker Desktop 要先開著），等它印出網址與 key 再試一次。\n${(r.stderr || r.stdout).trim().split('\n').slice(-3).join('\n')}`)
  cached = JSON.parse(r.stdout) as Stack
  return cached
}

// 容器名稱：supabase_<服務>_learn-supabase。services 用容器名稱中間那段，例如 ['db', 'kong', 'rest', 'auth']
export function requireStack(services: string[] = ['db', 'kong', 'rest']) {
  stack()
  const r = spawnSync('docker', ['ps', '--filter', 'name=_learn-supabase', '--format', '{{.Names}}'], { encoding: 'utf8', timeout: 15_000 })
  const running = new Set(r.stdout.split('\n').map(n => n.match(/^supabase_(.+)_learn-supabase$/)?.[1]).filter(Boolean))
  const missing = services.filter(s => !running.has(s))
  if (missing.length) throw new Error(`這一題需要的服務沒有在跑：${missing.join('、')}。你可能用 -x 排除了它們：在 learn 資料夾執行 npm --prefix supabase/practice run down，再執行 ${UP_CMD}`)
}

// 判分用的 slug：work/04 → w04；verify/04-12345-answer → v04_12345_answer
export function slugOf(dir: string): string {
  const kind = basename(dirname(dir)) === 'verify' ? 'v' : 'w'
  return kind + basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

// 以 postgres（超級使用者）直連資料庫執行 SQL。只給測試準備與檢查用；學習者的權限一律走 API 或 asRole()
export async function sql<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: stack().DB_URL, connectionTimeoutMillis: 5000 })
  await client.connect()
  try {
    return (await client.query(text, params)).rows
  } finally {
    await client.end()
  }
}

// 讓 PostgREST 看得到所有 t_ 開頭的 schema。清單每次從 pg_namespace 重算，用 advisory lock 排隊，好幾個人同時跑不會互相蓋掉
// 清單的第一個是「沒帶 Accept-Profile 時的預設 schema」，一定要是 public（跟 config.toml 的 [api] schemas 一樣的順序）
const SYNC_SCHEMAS = `
  select pg_advisory_xact_lock(hashtext('learn-supabase-schemas'));
  do $$ begin
    execute format('alter role authenticator set pgrst.db_schemas = %L', concat_ws(',', 'public', 'graphql_public',
      (select string_agg(nspname, ',' order by nspname) from pg_namespace where nspname like 't\\_%')));
  end $$;
  notify pgrst, 'reload config';
  notify pgrst, 'reload schema';`

export async function syncSchemas() {
  await sql(`begin; ${SYNC_SCHEMAS} commit;`)
}

// 這一題專屬的 schema（重建成空的），回傳名稱；學習者的 SQL 不寫 schema 前綴，用 applySql 套進去
export async function taskSchema(dir: string): Promise<string> {
  const schema = 't_' + slugOf(dir)
  await sql(`drop schema if exists ${schema} cascade; create schema ${schema}; grant usage on schema ${schema} to anon, authenticated, service_role;`)
  await syncSchemas()
  await waitSchema(schema)
  return schema
}

// 也一併刪掉同一題的 privateSchema（p_<slug>）
export async function dropTaskSchema(schema: string) {
  if (!/^t_[a-z0-9_]+$/.test(schema)) throw new Error(`不是判分用的 schema：${schema}`)
  await sql(`drop schema if exists ${schema} cascade; drop schema if exists p_${schema.slice(2)} cascade`)
  await syncSchemas()
}

// 這一題專屬、不公開給 API 的 schema p_<slug>（重建成空的）：課文裡的 private schema。
// 名稱不是 t_ 開頭，syncSchemas 不會把它加進 pgrst.db_schemas；沒有給任何角色 usage，要用的話由學習者自己 grant
export async function privateSchema(dir: string): Promise<string> {
  const schema = 'p_' + slugOf(dir)
  await sql(`drop schema if exists ${schema} cascade; create schema ${schema};`)
  return schema
}

// 在 schema 裡執行學習者的 SQL（search_path 指到這個 schema），出錯時丟出含 Postgres 訊息的 Error
export async function applySql(schema: string, text: string) {
  try {
    await sql(`set search_path = ${schema}, public, extensions; ${text}`)
  } catch (e: any) {
    throw new Error(`執行你的 SQL 失敗（${e.code ?? ''}）：${e.message}`)
  } finally {
    await sql(`notify pgrst, 'reload schema'`)
  }
  await waitCache(schema)
}

// reload schema 也是非同步的：等到這個 schema 裡每一張表與 view 都不再回 PGRST205（schema cache 裡找不到）。
// 沒有 GRANT 的表回 42501 也算載入了（OpenAPI 只列有權限的表，所以不能用它判斷）
async function waitCache(schema: string) {
  const names = (await sql<{ name: string }>(`select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = $1 and c.relkind in ('r', 'v', 'm', 'p', 'f')`, [schema])).map(r => r.name)
  const { API_URL, SECRET_KEY } = stack()
  const known = async (name: string) => {
    const r = await fetch(`${API_URL}/rest/v1/${encodeURIComponent(name)}?limit=0`, { headers: { apikey: SECRET_KEY, 'Accept-Profile': schema } })
    return !(await r.text()).includes('PGRST205')
  }
  for (let i = 0; i < 50; i++) {
    if ((await Promise.all(names.map(known))).every(Boolean)) return
    await new Promise(res => setTimeout(res, 200))
  }
  throw new Error(`PostgREST 10 秒內沒有載入 ${schema} 的表：執行 npm --prefix supabase/practice run status 確認服務都在跑`)
}

// PostgREST 重新載入設定是非同步的：等到這個 schema 能被查詢（回應不是 PGRST106「schema 不在清單裡」）
async function waitSchema(schema: string) {
  const { API_URL, SECRET_KEY } = stack()
  for (let i = 0; i < 50; i++) {
    const r = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: SECRET_KEY, 'Accept-Profile': schema } })
    if (r.status !== 406) return
    await new Promise(res => setTimeout(res, 200))
  }
  throw new Error(`PostgREST 10 秒內沒有載入 schema ${schema}：執行 npm --prefix supabase/practice run status 確認服務都在跑`)
}

export type Recorded = { method: string, path: string, query: URLSearchParams, headers: IncomingHttpHeaders }

// 記錄請求的 proxy：學習者的程式打 proxy.url，proxy 原樣轉送到課程的 API gateway 並記下每個請求。用完一定要 close()
export async function recordingProxy(target = stack().API_URL) {
  const requests: Recorded[] = []
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://proxy')
    requests.push({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, headers: req.headers })
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !['host', 'connection', 'content-length'].includes(k))) as Record<string, string>
    try {
      const r = await fetch(target + url.pathname + url.search, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined })
      res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k))))
      res.end(Buffer.from(await r.arrayBuffer()))
    } catch (e: any) {
      res.writeHead(502).end(`proxy 轉送失敗：${e.message}`)
    }
  })
  await new Promise<void>(res => server.listen(0, '127.0.0.1', res))
  const { port } = server.address() as AddressInfo
  return { url: `http://localhost:${port}`, requests, close: () => new Promise<void>(res => server.close(() => res())) }
}

export type TestUser = { id: string, email: string, password: string, accessToken: string, refreshToken: string }

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

// 判分用的真使用者：email 是 <slug>-<name>@learn.test（prepare.mjs 靠 slug 前綴清掉資料夾已經不在的人）。
// 用 secret key 的 admin API 建立（email 已驗證），再用 publishable key 登入拿到真的 access token。同名的舊使用者先刪掉
export async function createUser(dir: string, name: string, meta: { app_metadata?: object, user_metadata?: object } = {}): Promise<TestUser> {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`使用者名稱只能有 [a-z0-9_]：${name}`)
  const { API_URL, SECRET_KEY, PUBLISHABLE_KEY } = stack()
  const email = `${slugOf(dir)}-${name}@learn.test`
  const password = `pw-${name}-123456`
  await sql('delete from auth.users where email = $1', [email])
  const admin = createClient(API_URL, SECRET_KEY, { auth: noSession })
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, ...meta })
  if (created.error) throw new Error(`建立測試使用者 ${email} 失敗：${created.error.message}`)
  const anon = createClient(API_URL, PUBLISHABLE_KEY, { auth: noSession })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`測試使用者 ${email} 登入失敗：${error.message}`)
  return { id: data.user.id, email, password, accessToken: data.session.access_token, refreshToken: data.session.refresh_token }
}

// 刪掉這一題建立的所有使用者（after() 裡呼叫；要在 dropTaskSchema 之後，學習者的表可能用外鍵指向 auth.users）
export async function deleteUsers(dir: string) {
  await sql(`delete from auth.users where email like $1 escape '!'`, [`${slugOf(dir).replaceAll('_', '!_')}-%@learn.test`])
}

// 指向 schema 的 supabase-js client（送 Accept-Profile／Content-Profile）。user 給了就以那個人登入（authenticated），沒給就是 anon。
// url 可以換成 recordingProxy().url 來記錄請求。key 一律是 publishable：權限只能來自 GRANT＋RLS
export function clientFor(schema: string, user?: TestUser, url = stack().API_URL): SupabaseClient<any, any, any> {
  return createClient(url, stack().PUBLISHABLE_KEY, {
    db: { schema },
    auth: noSession,
    global: user ? { headers: { Authorization: `Bearer ${user.accessToken}` } } : {},
  })
}
