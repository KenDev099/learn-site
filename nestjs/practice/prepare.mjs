// learn/check.mjs 每次跑測試前先執行：node prepare.mjs <work/題號 或 verify/題號-pid-label>，cwd 是 nestjs/practice
// 非 0 結束時每一題都算沒過，stderr 的訊息會顯示在課程頁上，所以要寫清楚怎麼修
// 0. 作品專案課（pfNN）的出題檢查：資料夾裡有 reference.json（{ "ref": "saas" }）時，先把 portfolio-ref/<ref>/ 補進來；
//    已經在的檔案（wrong 的壞檔案）不覆蓋。學習者的 work/pfNN/ 只有測試檔，以下每一步都會略過
// 1. 沒有 .env 就從 .env.example 複製一份
// 2. 這一題要用的服務（task 的 package.json 的 "services"，有 prisma/schema.prisma 就一定要 postgres）有沒有在跑
// 3. 有 Prisma schema：prisma generate（型別檢查要用到產生的 client）
// 4. 型別檢查 tsc --noEmit：Vitest 只轉譯不檢查型別，不先擋下來，build 不過的程式也會被判通過
// 5. 有 Prisma schema：重建判分用的資料庫 nest_<題號>_test，套用學習者的 migration
// 6. 用到 Redis：刪掉這一題判分用的 key（REDIS_PREFIX 開頭）
// 5、6 也順便刪掉資料夾已經不在的題目留下的判分資料庫與 key（出題檢查每次的資料夾名稱都不同）
import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { join } from 'node:path'
import pg from 'pg'
import { Redis } from 'ioredis'
import { taskEnv, taskSlug } from './helpers/task.ts'

const codeDir = process.argv[2]
if (!codeDir) fail('用法：node prepare.mjs work/<題號>')
const dir = join(import.meta.dirname, codeDir)
const env = taskEnv(codeDir)
const bin = name => join(import.meta.dirname, 'node_modules', '.bin', name)
// 資料夾還在的題目（work/、verify/ 底下）：其他判分資料庫、Redis key 是被中斷或跑完的檢查留下的，順手刪掉
const live = new Set(['work', 'verify'].flatMap(d => existsSync(join(import.meta.dirname, d)) ? readdirSync(join(import.meta.dirname, d)).map(taskSlug) : []))
const clean = s => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim()

function fail(message) {
  console.error(message)
  process.exit(1)
}

// 0. 參考實作
if (existsSync(join(dir, 'reference.json'))) {
  const { ref } = JSON.parse(readFileSync(join(dir, 'reference.json'), 'utf8'))
  cpSync(join(import.meta.dirname, 'portfolio-ref', ref), dir, { recursive: true, force: false, filter: f => !/(^|\/)(node_modules|dist|generated|\.env)$/.test(f) })
}

// 1. .env
if (existsSync(join(dir, '.env.example')) && !existsSync(join(dir, '.env'))) copyFileSync(join(dir, '.env.example'), join(dir, '.env'))

// 2. 服務
const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {}
const hasPrisma = existsSync(join(dir, 'prisma', 'schema.prisma'))
const services = new Set(pkg.services ?? [])
if (hasPrisma) services.add('postgres')
const ports = { postgres: 5433, redis: 6380, mailpit: 8026 }
const names = { postgres: 'PostgreSQL', redis: 'Redis', mailpit: 'Mailpit' }

const listening = port => new Promise(resolve => {
  const socket = connect({ host: '127.0.0.1', port, timeout: 1000 })
  const done = ok => { socket.destroy(); resolve(ok) }
  socket.once('connect', () => done(true)).once('error', () => done(false)).once('timeout', () => done(false))
})
for (const s of services) {
  if (await listening(ports[s])) continue
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 })
  if (docker.status !== 0) fail([
    `這一題要用 ${names[s]}，但 Docker 沒有在執行。`,
    '1. 打開 Docker Desktop（終端機可以執行 open -a Docker），等它啟動完成（docker info 不再出錯）',
    '2. 在 learn/nestjs/practice 執行：docker compose up -d --wait',
    '3. 再執行一次 node check.mjs',
  ].join('\n'))
  fail([
    `這一題要用 ${names[s]}，但 127.0.0.1:${ports[s]} 沒有回應：課程的容器還沒啟動。`,
    '在 learn/nestjs/practice 執行：docker compose up -d --wait',
    '（第 12 課教過；docker compose ps 可以看容器狀態）',
  ].join('\n'))
}

const run = (cmd, args, extraEnv = {}) => spawnSync(cmd, args, {
  cwd: dir, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, ...extraEnv, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
})

// 3. prisma generate
if (hasPrisma) {
  const r = run(bin('prisma'), ['generate'], { DATABASE_URL: env.DATABASE_URL })
  if (r.status !== 0) fail(`prisma generate 失敗：prisma/schema.prisma 有錯，先修好它（訊息如下）。\n${clean(r.stdout + r.stderr)}`)
}

// 4. 型別檢查
if (existsSync(join(dir, 'tsconfig.json'))) {
  const r = spawnSync(bin('tsc'), ['--noEmit', '--pretty', 'false', '-p', join(codeDir, 'tsconfig.json')], { cwd: import.meta.dirname, encoding: 'utf8' })
  if (r.status !== 0) fail(`TypeScript 型別檢查沒過，npm run build 也會失敗。先修好這些錯誤，測試才會開始跑：\n${clean(r.stdout + r.stderr)}`)
}

// 5. 判分用的資料庫
if (hasPrisma) {
  const db = new URL(env.DATABASE_URL).pathname.slice(1)
  if (!/^nest_[a-z0-9_]+_test$/.test(db)) fail(`資料庫名稱不對：${db}`)   // 只會刪判分專用的 *_test 資料庫
  const migrations = join(dir, 'prisma', 'migrations')
  if (!existsSync(migrations) || !readdirSync(migrations, { withFileTypes: true }).some(d => d.isDirectory())) {
    fail(`還沒有 migration：在 ${codeDir} 執行 npx prisma migrate dev --name init，產生 prisma/migrations/ 之後再判分。`)
  }
  const client = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${db}`, '/learn'), connectionTimeoutMillis: 5000 })
  try {
    await client.connect()
    const { rows } = await client.query(`SELECT datname FROM pg_database WHERE datname ~ '^nest_[a-z0-9_]+_test$'`)
    for (const { datname } of rows) if (!live.has(datname.slice(5, -5))) await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`).catch(() => {})
    await client.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`)
    await client.query(`CREATE DATABASE "${db}"`)
  } catch (e) {
    fail(`連不上課程的 PostgreSQL（127.0.0.1:5433，帳號 learn）：${e.message}\n確認是在 learn/nestjs/practice 用 docker compose up -d --wait 啟動的容器。`)
  } finally {
    await client.end().catch(() => {})
  }
  const r = run(bin('prisma'), ['migrate', 'deploy'], { DATABASE_URL: env.DATABASE_URL })
  if (r.status !== 0) fail(`套用 migration 失敗（prisma migrate deploy）：prisma/migrations/ 裡的 SQL 有錯，訊息如下。\n${clean(r.stdout + r.stderr)}`)
}

// 6. Redis
if (services.has('redis')) {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await redis.connect()
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'nest-*-test*', 'COUNT', 500)
      const stale = keys.filter(k => k.startsWith(env.REDIS_PREFIX) || !live.has(k.match(/^nest-([a-z0-9_]+)-test/)?.[1]))
      if (stale.length) await redis.del(...stale)
      cursor = next
    } while (cursor !== '0')
  } catch (e) {
    fail(`清除 Redis 測試資料失敗（127.0.0.1:6380）：${e.message}\n在 learn/nestjs/practice 執行 docker compose up -d --wait`)
  } finally {
    redis.disconnect()
  }
}
