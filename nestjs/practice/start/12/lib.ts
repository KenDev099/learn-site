// 三題共用：連到課程的容器、這一題的資料庫名稱與 Redis key、讀 answers.json
// 連線位置取自判分給的 DATABASE_URL／REDIS_URL（127.0.0.1:5433、127.0.0.1:6380），只換資料庫與 Redis DB
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import pg from 'pg'
import { Redis } from 'ioredis'
import { taskSlug } from '../../helpers/task.ts'

const dir = import.meta.dirname
const slug = taskSlug(dir)                 // work/12 → 12
export const DB = `nest_${slug}`           // 你建立的開發用資料庫：nest_12
export const KEY = `nest-${slug}:hello`    // 你在 Redis DB 0 設定的 key：nest-12:hello

export function pgUrl(database = 'learn') {
  const u = new URL(process.env.DATABASE_URL!)
  u.pathname = '/' + database
  return u.toString()
}

export async function query<T = any>(database: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: pgUrl(database), connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    return (await client.query(sql, params)).rows
  } finally {
    await client.end().catch(() => {})
  }
}

// 用某個連線字串連一次：成功回 null，失敗回錯誤代碼（ECONNREFUSED、28P01、3D000…）
export async function tryConnect(url: string): Promise<string | null> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    return null
  } catch (e: any) {
    return e.code ?? e.message
  } finally {
    await client.end().catch(() => {})
  }
}

export function redis(db: number) {
  const u = new URL(process.env.REDIS_URL!)
  u.pathname = '/' + db
  return new Redis(u.toString(), { maxRetriesPerRequest: 1 })
}

// ---- 出題檢查專用（tests/local-verify.mjs 在 practice/verify/ 底下跑）：學習者的 work/12 不會執行這一段 ----
// 標準答案和錯誤寫法要的「容器狀態」由 verify.json 描述，在這一題自己的資料庫（nest_12_answer…）與 key 上重建，
// 不碰學習者的 nest_12、nest-12:hello，也不必重啟共用的容器
const verifying = basename(dirname(dir)) === 'verify' && slug !== '12'
const fixture = verifying && existsSync(join(dir, 'verify.json')) ? JSON.parse(readFileSync(join(dir, 'verify.json'), 'utf8')) : {}

export async function setupVerify() {
  if (!verifying) return
  await teardownVerify()
  if (fixture.sql) {
    await query('learn', `CREATE DATABASE "${DB}"`)
    for (const s of fixture.sql) await query(DB, s)
  }
  if (fixture.hello) {
    const r = redis(fixture.hello.db)
    await r.set(KEY, fixture.hello.value)
    r.disconnect()
  }
}

export async function teardownVerify() {
  if (!verifying) return
  await query('learn', `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`)
  for (const db of [0, 1]) {
    const r = redis(db)
    await r.del(KEY)
    r.disconnect()
  }
}

// 練習 2 用：PostgreSQL 這次啟動的時間。出題檢查不能重啟共用的容器，verify.json 寫 "restarted": true 時當成「剛剛重啟過」
export async function serverStart(): Promise<string> {
  const sql = verifying && fixture.restarted ? 'SELECT clock_timestamp()::text AS t' : 'SELECT pg_postmaster_start_time()::text AS t'
  return (await query('learn', sql))[0].t
}

export async function readAnswers(): Promise<any> {
  const file = join(dir, 'answers.json')
  if (!existsSync(file)) return {}
  let text = readFileSync(file, 'utf8')
  if (verifying) text = text.replaceAll('/nest_12"', `/${DB}"`)   // 答案寫的是 nest_12，出題檢查用自己的資料庫
  let answers
  try {
    answers = JSON.parse(text)
  } catch (e: any) {
    throw new Error(`answers.json 不是正確的 JSON：${e.message}。字串要用雙引號、最後一個欄位後面不能有逗號`)
  }
  if (verifying && fixture.liveIdentifier) {
    answers.systemIdentifier = (await query('learn', 'SELECT system_identifier::text AS id FROM pg_control_system()'))[0].id
  }
  return answers
}
