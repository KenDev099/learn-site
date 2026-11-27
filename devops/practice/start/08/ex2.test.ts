// 練習 2：只改原始碼時 npm ci 要用快取；改了 package.json 才重跑
// 測試在暫存資料夾裡建置三次（不會動到你的檔案），用 --progress=plain 的輸出判斷 npm ci 那一步有沒有 CACHED
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { docker, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-08-cache', IMAGE = 'learn-devops/cafe-api:08-ex2'
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
let ctx = ''

// 回傳 npm ci 那一步有沒有用快取；找不到這一步回傳 null
function build() {
  const r = run('docker', ['build', '--progress=plain', '-t', IMAGE, '.'], { cwd: ctx, timeout: 600_000 })
  assert.equal(r.code, 0, `建置失敗，最後幾行：\n${tail(r.stderr)}`)
  const step = r.stderr.match(/^#(\d+) \[[^\]]*\] RUN\b.*\bnpm ci\b/m)?.[1]
  assert.ok(step, '建置過程找不到 RUN npm ci 這一步：安裝依賴要用 npm ci（照 lockfile 安裝）')
  return new RegExp(`^#${step} CACHED$`, 'm').test(r.stderr)
}

async function live() {
  removeContainers(NAME)
  assert.equal(docker('run', '-d', '--name', NAME, '-p', '127.0.0.1:18081:3000', IMAGE).code, 0, '容器啟動失敗')
  const res = await waitHttp('http://127.0.0.1:18081/health/live', 20_000)
  assert.equal(res.status, 200, '/health/live 要回 200')
}

before(() => {
  requireDocker()
  removeContainers(NAME)
  ctx = mkdtempSync(join(tmpdir(), 'ld-08-ex2-'))
  cpSync(join(dir, 'app'), ctx, { recursive: true, filter: f => !/[\\/](node_modules|dist)$/.test(f) })
})
after(() => {
  removeContainers(NAME)
  if (ctx) rmSync(ctx, { recursive: true, force: true })
})

test('第一次建置成功，有 RUN npm ci 這一步', () => {
  build()
})

test('只改 src/routes.ts：npm ci 是 CACHED，映像能正常執行', async () => {
  appendFileSync(join(ctx, 'src', 'routes.ts'), `\n// 快取測試 ${randomBytes(8).toString('hex')}\n`)
  assert.ok(build(), '只改了原始碼，npm ci 卻重新執行：先只複製 package.json 和 package-lock.json、npm ci，之後才複製其他檔案')
  await live()
})

test('改了 package.json：npm ci 重新執行，映像能正常執行', async () => {
  const pkg = JSON.parse(readFileSync(join(ctx, 'package.json'), 'utf8'))
  pkg.description = `快取測試 ${randomBytes(8).toString('hex')}`
  writeFileSync(join(ctx, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  assert.equal(build(), false, 'package.json 改了，npm ci 還是用快取：npm ci 之前要先 COPY package.json')
  await live()
})
