// 練習 1：正式環境用的映像：多階段、非 root、只有執行需要的東西、帶版本資訊、有 HEALTHCHECK
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:26-ex1'
const NAME = 'ld-26-ex1'
const SHA = randomBytes(20).toString('hex')        // 每次不同：寫死在 Dockerfile 裡的值不會剛好對上
let build = { code: 0 as number | null, stdout: '', stderr: '' }
let image: any = null

before(() => {
  requireDocker()
  removeContainers(NAME)
  docker('image', 'rm', '-f', IMAGE)
  build = run('docker', ['build', '--build-arg', 'APP_VERSION=9.9.9', '--build-arg', `GIT_SHA=${SHA}`, '-t', IMAGE, 'app'], { cwd: dir, timeout: 600_000 })
  if (build.code === 0) image = inspect(IMAGE, 'image')
})
after(() => removeContainers(NAME))

const built = () => assert.equal(build.code, 0, `docker build 失敗：\n${build.stderr.split('\n').slice(-15).join('\n')}`)
// 在映像裡執行一個指令（不經過 CMD）
// 不連資料庫也能啟動：/version、/health/live 不需要資料庫
function startApp() {
  if (inspect(NAME)) return
  const r = docker('run', '-d', '--name', NAME, '-p', '127.0.0.1:18264:3000',
    '-e', 'DB_HOST=db', '-e', 'DB_NAME=cafe', '-e', 'DB_USER=x', '-e', 'DB_PASSWORD=x', '-e', 'REDIS_URL=redis://redis:6379', IMAGE)
  assert.equal(r.code, 0, `容器啟動失敗：${r.stderr}`)
}
const inImage = (...cmd: string[]) => run('docker', ['run', '--rm', '--entrypoint', 'sh', IMAGE, '-c', cmd.join(' ')])

test('docker build 成功，docker build --check 沒有警告', () => {
  built()
  const r = run('docker', ['build', '--check', 'app'], { cwd: dir, timeout: 300_000 })
  assert.equal(r.code, 0, `docker build --check 有警告（第 9 課）：\n${(r.stdout + '\n' + r.stderr).split('\n').filter(l => /WARN|warning|-\s/.test(l)).slice(0, 8).join('\n')}`)
})

test('.dockerignore 擋掉 node_modules、dist、.env', () => {
  const lines = readFileSync(join(dir, 'app', '.dockerignore'), 'utf8').split('\n').map(l => l.trim().replace(/^\/|\/$/g, ''))
  for (const name of ['node_modules', 'dist', '.env'])
    assert.ok(lines.includes(name), `.dockerignore 少了 ${name}：本機的 ${name} 會被送進建置環境，可能蓋掉映像裡建好的東西，或把機密帶進映像`)
})

test('以非 root 使用者執行', () => {
  built()
  const user = String(image.Config.User ?? '')
  assert.ok(user && !/^(root|0)(:|$)/.test(user), `映像的 USER 是「${user || '（沒設定，就是 root）'}」：node 映像內建 node 使用者，在 CMD 前加 USER node`)
  const id = inImage('id -u')
  assert.notEqual(id.stdout, '0', '容器裡 id -u 是 0，還是 root')
})

test('最終映像只有執行需要的東西：沒有 devDependencies、沒有 TypeScript 原始碼', () => {
  built()
  const r = inImage('cd /app 2>/dev/null || cd "$(pwd)"; ls node_modules/typescript >/dev/null 2>&1 && echo HAS_TS; ls src >/dev/null 2>&1 && echo HAS_SRC; ls dist/server.js >/dev/null 2>&1 && echo HAS_DIST; ls migrations/001_init.sql >/dev/null 2>&1 && echo HAS_MIGRATIONS; ls node_modules/pg >/dev/null 2>&1 && echo HAS_PG')
  const has = (k: string) => r.stdout.includes(k)
  assert.ok(has('HAS_DIST') && has('HAS_PG'), `工作目錄（WORKDIR /app）裡找不到 dist/server.js 或 node_modules/pg：\n${r.stdout}${r.stderr}`)
  assert.ok(has('HAS_MIGRATIONS'), '映像裡要有 migrations/：部署前的 migration 就是用這個映像跑的（node dist/migrate.js）')
  assert.ok(!has('HAS_TS'), '最終映像裡有 typescript：那是 devDependencies，只有建置階段需要。最終階段用 npm ci --omit=dev 裝依賴（或從只裝正式依賴的階段複製）')
  assert.ok(!has('HAS_SRC'), '最終映像裡有 src/：執行只需要 dist/，原始碼留在建置階段')
})

test('版本資訊：label org.opencontainers.image.revision 等於 GIT_SHA，/version 回報 APP_VERSION 與 GIT_SHA', async () => {
  built()
  const labels = image.Config.Labels ?? {}
  assert.equal(labels['org.opencontainers.image.revision'], SHA, '建置時傳入 --build-arg GIT_SHA=…，label org.opencontainers.image.revision 要是同一個值（LABEL 可以用 $GIT_SHA）')
  startApp()
  const res = await waitHttp('http://localhost:18264/version', 20_000)
  const body = await res.json()
  assert.deepEqual(body, { version: '9.9.9', sha: SHA }, `/version 回傳 ${JSON.stringify(body)}：ARG 只在建置時存在，要用 ENV APP_VERSION=$APP_VERSION、ENV GIT_SHA=$GIT_SHA 讓程式讀得到`)
})

test('HEALTHCHECK 打 /health/live，容器會變成 healthy', async () => {
  built()
  const hc = image.Config.Healthcheck?.Test ?? []
  assert.ok(hc.length && hc[0] !== 'NONE', '映像沒有 HEALTHCHECK')
  assert.match(hc.join(' '), /\/health\/live/, `HEALTHCHECK 要打 /health/live（不依賴資料庫的 liveness），現在是：${hc.join(' ')}`)
  // 程式沒在跑時，同一個檢查指令要失敗：echo、|| true 這種永遠成功的檢查擋不下任何問題
  const cmd = hc[0] === 'CMD-SHELL' ? ['sh', '-c', hc[1]] : hc.slice(1)
  const dead = run('docker', ['run', '--rm', '--entrypoint', cmd[0], IMAGE, ...cmd.slice(1)], { timeout: 60_000 })
  assert.notEqual(dead.code, 0, `程式沒有在跑，HEALTHCHECK 的指令（${hc.slice(1).join(' ')}）卻以 0 結束：它要真的打 http://127.0.0.1:3000/health/live，連不上就失敗`)
  startApp()
  const end = Date.now() + 40_000
  let status = ''
  while (Date.now() < end) {
    status = inspect(NAME)?.State?.Health?.Status ?? ''
    if (status === 'healthy') return
    await new Promise(r => setTimeout(r, 500))
  }
  assert.fail(`40 秒內容器沒有變成 healthy（現在是 ${status || '沒有健康狀態'}）：node:alpine 映像沒有 curl，可以用 wget 或 node -e "fetch(…)"；--start-interval 讓啟動期間檢查得更勤`)
})
