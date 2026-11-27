// learn/check.mjs 每次跑測試前先執行：node prepare.mjs <work/題號 或 verify/題號-pid-label>，cwd 是 delivery/practice
// 非 0 結束時每一題都算沒過，stderr 的訊息會顯示在課程頁上，所以要寫清楚怎麼修
// 0. 有 history/<題號>/ 的題目（第 2 課練習 4）而且還沒有 .git：把起始檔建成一個 git repo，見下面 setupRepo
// 1. 沒有 api/.env 就從 api/.env.example 複製一份
// 2. PostgreSQL（127.0.0.1:5436）有沒有在跑
// 3. prisma generate（型別檢查要用到產生的 client）
// 4. 型別閘門：tsc -p api、vue-tsc -p web。Vitest 只轉譯不檢查型別，不先擋下來，build 不過的程式也會被判通過
//    例外：task 的 package.json 寫 "typeGate": false（第 6 課：修型別錯誤本身就是練習）
// 5. 重建判分用的資料庫 delivery_<slug>_test，套用 migration、跑 seed；順便刪掉資料夾已經不在的題目留下的判分資料庫
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { connect } from 'node:net'
import { devNull, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import pg from 'pg'
import { taskEnv, taskSlug } from './helpers/task.ts'

const codeDir = process.argv[2]
if (!codeDir) fail('用法：node prepare.mjs work/<題號>')
const dir = join(import.meta.dirname, codeDir)
const api = join(dir, 'api')
const env = taskEnv(codeDir)
const bin = name => join(import.meta.dirname, 'node_modules', '.bin', name)
const live = new Set(['work', 'verify'].flatMap(d => existsSync(join(import.meta.dirname, d)) ? readdirSync(join(import.meta.dirname, d)).map(taskSlug) : []))
const clean = s => String(s ?? '').replace(/\x1b\[[0-9;]*m/g, '').trim()
const PORT = 5436

function fail(message) {
  console.error(message)
  process.exit(1)
}

// 0. 練習用的 git repo（只建一次：之後是學習者自己的 repo，不再碰它）
//    main：起始檔一個 commit；origin：.git/origin.git 這個本機的 bare repo，當作團隊的遠端
//    同事的 commit（history/<題號>/colleague.patch）只推到 origin：本機的 origin/main 還停在舊的那個，git fetch 才看得到
//    出題檢查（verify/）的答案與錯誤寫法放 git-steps.sh，建好 repo 之後照著跑，模擬學習者打的指令
const task = basename(codeDir).split('-')[0]
const history = join(import.meta.dirname, 'history', task)
if (existsSync(history) && !existsSync(join(dir, '.git'))) setupRepo()

function setupRepo() {
  // 不讀學習者的 ~/.gitconfig（gpgsign、hooks、預設分支名稱都可能讓建立失敗），作者與時間固定
  const git = (args, { cwd = dir, as = ['阿哲', 'azhe@cafe.example'], date } = {}) => {
    const r = spawnSync('git', args, {
      cwd, encoding: 'utf8',
      env: {
        ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: as[0], GIT_AUTHOR_EMAIL: as[1], GIT_COMMITTER_NAME: as[0], GIT_COMMITTER_EMAIL: as[1],
        ...date && { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      },
    })
    if (r.status !== 0) {
      rmSync(join(dir, '.git'), { recursive: true, force: true })   // 下次判分重建
      fail(`建立練習用的 git repo 失敗（git ${args.join(' ')}）：\n${clean(r.error?.message ?? r.stdout + r.stderr)}\n確認終端機可以執行 git --version。`)
    }
    return r.stdout.trim()
  }
  const origin = join(dir, '.git', 'origin.git')
  git(['init', '-q', '-b', 'main'])
  copyFileSync(join(history, 'exclude'), join(dir, '.git', 'info', 'exclude'))   // 課程的練習檔不進 repo
  git(['--work-tree', join(import.meta.dirname, 'start', task), 'add', '-A'])     // 用起始檔：verify/ 的工作目錄已經蓋上答案了
  git(['commit', '-q', '-m', 'chore: 咖啡店點餐系統（11/2 的版本）'], { date: '2026-11-02T18:00:00+08:00' })
  git(['init', '-q', '--bare', '-b', 'main', origin])
  git(['remote', 'add', 'origin', origin])
  git(['push', '-q', '-u', 'origin', 'main'])
  const tmp = mkdtempSync(join(tmpdir(), 'learn-delivery-git-'))
  git(['worktree', 'add', '-q', '--detach', tmp])
  git(['am', '-q', '--committer-date-is-author-date', join(history, 'colleague.patch')], { cwd: tmp, as: ['小芸', 'yun@cafe.example'] })
  const colleague = git(['rev-parse', 'HEAD'], { cwd: tmp })
  git(['push', '-q', origin, 'HEAD:refs/heads/main'], { cwd: tmp })   // 寫路徑不寫 origin：本機的 origin/main 不跟著更新
  git(['worktree', 'remove', '--force', tmp])
  writeFileSync(join(dir, '.git', 'learn.json'), JSON.stringify({ colleague }))   // 練習 4 的測試用來確認 main 沒被改、同事的 commit 還在
  if (existsSync(join(dir, 'git-steps.sh'))) {
    const r = spawnSync('bash', ['git-steps.sh'], {
      cwd: dir, encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: '出題檢查', GIT_AUTHOR_EMAIL: 'verify@cafe.example', GIT_COMMITTER_NAME: '出題檢查', GIT_COMMITTER_EMAIL: 'verify@cafe.example' },
    })
    if (r.status !== 0) fail(`git-steps.sh 失敗：\n${clean(r.stdout + r.stderr)}`)
  }
}

// 1. .env
if (existsSync(join(api, '.env.example')) && !existsSync(join(api, '.env'))) copyFileSync(join(api, '.env.example'), join(api, '.env'))

// 2. PostgreSQL
const pkg = existsSync(join(dir, 'package.json')) ? JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) : {}
const listening = port => new Promise(resolve => {
  const socket = connect({ host: '127.0.0.1', port, timeout: 1000 })
  const done = ok => { socket.destroy(); resolve(ok) }
  socket.once('connect', () => done(true)).once('error', () => done(false)).once('timeout', () => done(false))
})
if ((pkg.services ?? []).includes('postgres') && !(await listening(PORT))) {
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 })
  fail(docker.status !== 0 ? [
    '這一題要用 PostgreSQL，但 Docker 沒有在執行。',
    '1. 打開 Docker Desktop（終端機可以執行 open -a Docker），等它啟動完成（docker info 不再出錯）',
    `2. 在 learn/delivery/practice/${codeDir} 執行：docker compose up -d --wait`,
    '3. 再執行一次 node check.mjs',
  ].join('\n') : [
    `這一題要用 PostgreSQL，但 127.0.0.1:${PORT} 沒有回應：課程的資料庫容器還沒啟動。`,
    `在 learn/delivery/practice/${codeDir} 執行：docker compose up -d --wait`,
    '（docker compose ps 可以看容器狀態）',
  ].join('\n'))
}

const run = (cmd, args, cwd) => spawnSync(cmd, args, {
  cwd, encoding: 'utf8', timeout: 120_000,
  env: { ...process.env, DATABASE_URL: env.DATABASE_URL, PRISMA_HIDE_UPDATE_MESSAGE: '1', PATH: `${bin('')}:${process.env.PATH}` },   // PATH：seed 指令裡的 prisma
})

// 3. prisma generate
let r = run(bin('prisma'), ['generate'], api)
if (r.status !== 0) fail(`prisma generate 失敗：api/prisma/schema.prisma 有錯，先修好它（訊息如下）。\n${clean(r.stdout + r.stderr)}`)

// 4. 型別閘門
if (pkg.typeGate !== false) {
  for (const [tool, project, name] of [['tsc', 'api', 'API'], ['vue-tsc', 'web', '前台']]) {
    if (!existsSync(join(dir, project, 'tsconfig.json'))) continue
    r = run(bin(tool), ['--noEmit', '--pretty', 'false', '-p', join(dir, project, 'tsconfig.json')], import.meta.dirname)
    if (r.status !== 0) fail(`${name}的 TypeScript 型別檢查沒過（${tool} -p ${project}）。先修好這些錯誤，測試才會開始跑：\n${clean(r.stdout + r.stderr)}`)
  }
}

// 5. 判分用的資料庫
const db = new URL(env.DATABASE_URL).pathname.slice(1)
if (!/^delivery_[a-z0-9_]+_test$/.test(db)) fail(`資料庫名稱不對：${db}`)   // 只會刪判分專用的 *_test 資料庫
const client = new pg.Client({ connectionString: env.DATABASE_URL.replace(`/${db}`, '/learn'), connectionTimeoutMillis: 5000 })
try {
  await client.connect()
  const { rows } = await client.query(`SELECT datname FROM pg_database WHERE datname ~ '^delivery_[a-z0-9_]+_test$'`)
  for (const { datname } of rows) if (!live.has(datname.slice(9, -5))) await client.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`).catch(() => {})
  await client.query(`DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`)
  await client.query(`CREATE DATABASE "${db}"`)
} catch (e) {
  fail(`連不上課程的 PostgreSQL（127.0.0.1:${PORT}，帳號 learn）：${e.message}\n確認是用這個專案的 docker compose up -d --wait 啟動的容器。`)
} finally {
  await client.end().catch(() => {})
}
r = run(bin('prisma'), ['migrate', 'deploy'], api)
if (r.status !== 0) fail(`套用 migration 失敗（prisma migrate deploy）：api/prisma/migrations/ 裡的 SQL 有錯，訊息如下。\n${clean(r.stdout + r.stderr)}`)
r = run(bin('prisma'), ['db', 'seed'], api)
if (r.status !== 0) fail(`種子資料失敗（prisma db seed）：api/prisma/seed.sql 有錯，訊息如下。\n${clean(r.stdout + r.stderr)}`)
