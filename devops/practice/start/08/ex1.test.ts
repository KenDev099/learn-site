// 練習 1：app/Dockerfile 與 app/.dockerignore 要能直接上線
// 測試把 app/ 複製到暫存資料夾，放進三個陷阱（Mac 的 node_modules、.env、.git），建置、啟動、檢查，最後清掉容器
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { docker, inspect, removeContainers, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const NAME = 'ld-08-api', PROBE = 'ld-08-nohttp', IMAGE = 'learn-devops/cafe-api:08-ex1', URL = 'http://127.0.0.1:18080'
const tail = (s: string) => s.split('\n').slice(-15).join('\n')
const TRAPS = ['node_modules/SHOULD_NOT_COPY', '.env', '.git']
let ctx = '', out = '', built = false, started = false, buildLog = ''

before(() => {
  requireDocker()
  removeContainers(NAME, PROBE)
  ctx = mkdtempSync(join(tmpdir(), 'ld-08-ex1-'))
  cpSync(join(dir, 'app'), ctx, { recursive: true, filter: f => !/[\\/](node_modules|dist)$/.test(f) })
  // 陷阱：在 Mac 上 npm install 過的 node_modules、本機的 .env、git 的資料夾
  mkdirSync(join(ctx, 'node_modules'))
  writeFileSync(join(ctx, 'node_modules', 'SHOULD_NOT_COPY'), 'mac\n')
  writeFileSync(join(ctx, '.env'), `DB_PASSWORD=${randomBytes(12).toString('hex')}\n`)
  mkdirSync(join(ctx, '.git'))
  writeFileSync(join(ctx, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  const b = run('docker', ['build', '-t', IMAGE, '.'], { cwd: ctx, timeout: 600_000 })
  built = b.code === 0
  buildLog = b.stderr || b.stdout
  if (built) started = docker('run', '-d', '--name', NAME, '-p', '127.0.0.1:18080:3000', '-e', 'DRAIN_MS=500', '--health-interval', '2s', IMAGE).code === 0
})
after(() => {
  removeContainers(NAME, PROBE)
  if (ctx) rmSync(ctx, { recursive: true, force: true })
  if (out) rmSync(out, { recursive: true, force: true })
})

test('docker build 成功', () => {
  assert.ok(built, `建置失敗，最後幾行：\n${tail(buildLog)}\n（找不到 tsc？看看 NODE_ENV=production 放在哪裡）`)
})

test('docker build --check 沒有任何警告', () => {
  const r = run('docker', ['build', '--check', '.'], { cwd: ctx, timeout: 600_000 })
  assert.equal(r.code, 0, `build check 有警告：\n${tail(r.stdout + '\n' + r.stderr)}`)
})

test('映像的 /app 裡沒有 node_modules/SHOULD_NOT_COPY、.env、.git', () => {
  assert.ok(built, '先讓建置成功')
  assert.equal(inspect(IMAGE, 'image')?.Config.WorkingDir, '/app', '工作目錄要是 /app（WORKDIR /app）')
  const r = docker('run', '--rm', '--entrypoint', 'sh', IMAGE, '-c',
    'for f in node_modules/SHOULD_NOT_COPY .env .git; do [ -e "/app/$f" ] && echo "$f"; done; true')
  assert.equal(r.stdout, '', `這些東西被複製進映像了：${r.stdout.split('\n').join('、')}。在 .dockerignore 排除它們`)
})

test('.dockerignore 讓三個陷阱根本不會送進建置情境', () => {
  // 用一份只有 COPY . / 的 Dockerfile 把建置情境原樣輸出到資料夾，看 .dockerignore 擋掉了什麼
  out = mkdtempSync(join(tmpdir(), 'ld-08-ex1-ctx-'))
  const r = run('docker', ['build', '-q', '-f', '-', '--output', `type=local,dest=${out}`, '.'], { cwd: ctx, input: 'FROM scratch\nCOPY . /\n', timeout: 180_000 })
  assert.equal(r.code, 0, `輸出建置情境失敗：\n${tail(r.stderr)}`)
  const leaked = TRAPS.filter(f => existsSync(join(out, f)))
  assert.deepEqual(leaked, [], `這些東西被送進建置情境：${leaked.join('、')}。在 Dockerfile 裡 RUN rm 刪掉也沒用，檔案還留在 COPY 那一層，要在 .dockerignore 排除`)
})

test('容器在 30 秒內變成 healthy，/health/live 回 200', async () => {
  assert.ok(started, '容器沒有啟動成功：先讓建置成功')
  const res = await waitHttp(`${URL}/health/live`, 20_000)
  assert.equal(res.status, 200, '/health/live 要回 200')
  const end = Date.now() + 30_000
  for (;;) {
    const h = inspect(NAME)?.State.Health
    assert.ok(h, '映像沒有 HEALTHCHECK：docker inspect 看不到 .State.Health')
    if (h.Status === 'healthy') break
    const last = h.Log?.at(-1)
    assert.notEqual(h.Status, 'unhealthy', `健康檢查一直失敗，最後一次的輸出：${last?.Output?.trim() || '（沒有輸出）'}，結束碼 ${last?.ExitCode}。映像裡有你呼叫的指令嗎？`)
    assert.ok(Date.now() < end, `30 秒後還是 ${h.Status}`)
    await new Promise(r => setTimeout(r, 500))
  }
})

test('app 沒有回應時，健康檢查指令會失敗', async () => {
  assert.ok(built, '先讓建置成功')
  const t: string[] | undefined = inspect(IMAGE, 'image')?.Config.Healthcheck?.Test
  assert.ok(t && t[0] !== 'NONE', '映像沒有 HEALTHCHECK')
  // 同一個映像改跑一個不聽 port 的 node，再手動執行一次映像裡的健康檢查指令
  assert.equal(docker('run', '-d', '--name', PROBE, '--entrypoint', 'node', IMAGE, '-e', 'setInterval(() => {}, 1000)').code, 0, '測試用的容器啟動失敗')
  const cmd = t[0] === 'CMD-SHELL' ? ['sh', '-c', t[1]] : t.slice(1)
  const r = run('docker', ['exec', PROBE, ...cmd], { timeout: 15_000 })
  removeContainers(PROBE)
  assert.notEqual(r.code, 0, '/health/live 根本連不上，健康檢查卻回報成功（結束碼 0）：檢查要真的請求 /health/live，失敗時結束碼不是 0')
})

test('容器不是用 root 執行', () => {
  assert.ok(started, '容器沒有啟動成功')
  const r = docker('exec', NAME, 'id', '-u')
  assert.equal(r.code, 0, `docker exec 失敗：${r.stderr}`)
  assert.notEqual(r.stdout, '0', 'id -u 是 0，表示用 root 執行：node 映像內建 node 使用者，用 USER 切換')
})

test('PID 1 是 node，不是 npm 或 sh', () => {
  assert.ok(started, '容器沒有啟動成功')
  const argv = docker('exec', NAME, 'cat', '/proc/1/cmdline').stdout.split('\0').filter(Boolean)
  assert.equal(argv[0]?.split('/').at(-1), 'node', `PID 1 是「${argv.join(' ')}」：用 exec 形式的 CMD 直接啟動 node`)
})

test('docker stop 在 5 秒內結束，結束碼 0，有印出 shutdown complete', () => {
  assert.ok(started, '容器沒有啟動成功')
  const t = Date.now()
  docker('stop', NAME)
  const ms = Date.now() - t
  const c = inspect(NAME)
  const logs = docker('logs', NAME)
  assert.ok(ms < 5_000, `docker stop 花了 ${(ms / 1000).toFixed(1)} 秒：SIGTERM 沒有送到 node，等到逾時被 SIGKILL`)
  assert.equal(c.State.ExitCode, 0, `結束碼是 ${c.State.ExitCode}（137 表示被 SIGKILL）`)
  assert.match(logs.stdout + logs.stderr, /shutdown complete/, 'log 裡沒有 shutdown complete：app 沒有走完優雅關機')
})
