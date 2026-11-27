// 練習 1：同一個映像跑在 staging 和 production。設定在部署時才給：APP_ENV 選 config/<環境>.env，LOG_LEVEL 用變數替換
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { inspect, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const IMAGE = 'learn-devops/cafe-api:11'
const tmp = mkdtempSync(join(tmpdir(), 'ld-11-ex1-'))
// 部署時才決定的值：每次隨機挑一個 log 等級，寫死在哪裡都不會剛好對
const LEVEL = ['warn', 'debug', 'error', 'trace'][randomBytes(1)[0] % 4]

// 模擬兩次部署各自的變數檔（相當於伺服器上的 .env），用 --env-file 指定
const envFile = (name: string, text: string) => { const f = join(tmp, name); writeFileSync(f, text); return f }
const compose = (envPath: string, ...args: string[]) =>
  run('docker', ['compose', '-p', 'ld-11', '--env-file', envPath, ...args], { cwd: dir, timeout: 600_000 })
const apiEnv = (envPath: string) => {
  const r = compose(envPath, 'config', '--format', 'json')
  assert.equal(r.code, 0, `docker compose --env-file ${envPath} config 失敗：\n${r.stderr}`)
  return JSON.parse(r.stdout).services.api.environment ?? {}
}

before(() => {
  requireDocker()
  // 練習 2 的密碼檔還沒做時，先放一個，讓 compose 有東西可以掛
  const pw = join(dir, 'secrets', 'db_password.txt')
  if (!existsSync(pw)) {
    mkdirSync(join(dir, 'secrets'), { recursive: true, mode: 0o700 })
    writeFileSync(pw, randomBytes(16).toString('hex') + '\n', { mode: 0o600 })
    chmodSync(pw, 0o600)
  }
  compose(envFile('down.env', 'APP_ENV=staging\n'), 'down', '-v', '--remove-orphans')
})
after(() => {
  compose(envFile('down.env', 'APP_ENV=staging\n'), 'down', '-v', '--remove-orphans')
  rmSync(tmp, { recursive: true, force: true })
})

test('staging：APP_ENV=staging 時，容器拿到 staging 的設定，LOG_LEVEL 沒給就是 info', () => {
  const env = apiEnv(envFile('staging.env', 'APP_ENV=staging\n'))
  assert.equal(env.APP_ENV, 'staging', `api 的 APP_ENV 是 ${env.APP_ENV}：用 env_file 載入 config/\${APP_ENV}.env，config/staging.env 裡寫 APP_ENV=staging`)
  assert.equal(env.FEATURE_LOYALTY, 'true', 'staging 要開集點功能：config/staging.env 寫 FEATURE_LOYALTY=true')
  assert.equal(env.LOG_LEVEL, 'info', `沒有給 LOG_LEVEL 時要是 info（現在是 ${env.LOG_LEVEL}）：environment 寫 LOG_LEVEL: \${LOG_LEVEL:-info}`)
})

test('production：同一份 compose.yaml 換一個變數檔，就拿到 production 的設定', () => {
  const env = apiEnv(envFile('prod.env', `APP_ENV=production\nLOG_LEVEL=${LEVEL}\n`))
  assert.equal(env.APP_ENV, 'production', `api 的 APP_ENV 是 ${env.APP_ENV}：環境要由部署時的 APP_ENV 決定，不能寫死`)
  assert.equal(env.FEATURE_LOYALTY, 'false', 'production 先不開集點功能：config/production.env 寫 FEATURE_LOYALTY=false')
  assert.equal(env.LOG_LEVEL, LEVEL, `部署時給了 LOG_LEVEL=${LEVEL}，容器卻拿到 ${env.LOG_LEVEL}：LOG_LEVEL 要寫在 environment 用 \${LOG_LEVEL:-info} 替換，不要寫死在 config/*.env`)
})

test('沒有指定 APP_ENV 時，docker compose config 直接失敗', () => {
  const r = compose(envFile('empty.env', ''), 'config', '--format', 'json')
  if (r.code === 0) {
    const env = JSON.parse(r.stdout).services.api.environment ?? {}
    assert.fail(`沒有 APP_ENV 也能產生設定（api 拿到 APP_ENV=${env.APP_ENV}）：忘了設定就該停下來，不能默默部署成某個環境。用 \${APP_ENV:?訊息}`)
  }
})

test('映像裡沒有燒進 APP_ENV、LOG_LEVEL、FEATURE_LOYALTY', () => {
  const r = run('docker', ['compose', '-p', 'ld-11', '--env-file', envFile('build.env', 'APP_ENV=production\n'), 'build', 'api'], { cwd: dir, timeout: 600_000 })
  assert.equal(r.code, 0, `docker compose build api 失敗：\n${r.stderr.split('\n').slice(-12).join('\n')}`)
  const env: string[] = inspect(IMAGE, 'image')?.Config.Env ?? []
  const baked = env.filter(e => /^(APP_ENV|LOG_LEVEL|FEATURE_LOYALTY)=/.test(e))
  assert.deepEqual(baked, [], `docker image inspect ${IMAGE} 看到 ${baked.join('、')}：拿掉 app/Dockerfile 裡的 ENV，同一個映像才能用在每個環境`)
})

test('用 production 的變數檔啟動，GET /config 回傳 production 的設定', async () => {
  const prod = envFile('prod.env', `APP_ENV=production\nLOG_LEVEL=${LEVEL}\n`)
  let r = compose(prod, 'up', '-d', '--wait', '--build')
  // Docker Desktop 偶爾還看不到剛建立的 secret 檔：再試一次
  if (r.code !== 0 && r.stderr.includes('bind source path does not exist')) r = compose(prod, 'up', '-d', '--wait')
  assert.equal(r.code, 0, `docker compose up --wait 失敗：\n${r.stderr.split('\n').slice(-12).join('\n')}\n用 docker compose -p ld-11 logs api 看 app 印了什麼`)
  const res = await waitHttp('http://127.0.0.1:18110/config', 30_000)
  assert.equal(res.status, 200, 'GET /config 要回 200')
  assert.deepEqual(await res.json(), { appEnv: 'production', logLevel: LEVEL, featureLoyalty: false }, '/config 的值要和這次部署給的一致')
})

test('.env 被 git 忽略，.env.example 列出鍵但不填值', () => {
  const g = mkdtempSync(join(tmpdir(), 'ld-11-git-'))
  try {
    const gi = join(dir, '.gitignore')
    assert.ok(existsSync(gi), '找不到 .gitignore')
    writeFileSync(join(g, '.gitignore'), readFileSync(gi))
    const git = (...a: string[]) => run('git', ['-C', g, ...a], { env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
    git('init', '-q')
    assert.equal(git('check-ignore', '-q', '--no-index', '.env').code, 0, '.env 沒有被忽略：在 .gitignore 加上 .env，它裝的是每台機器自己的值')
    for (const f of ['.env.example', 'config/staging.env', 'config/production.env', 'compose.yaml'])
      assert.notEqual(git('check-ignore', '-q', '--no-index', f).code, 0, `${f} 被忽略了：它要進 git，大家才知道有哪些設定`)
  } finally {
    rmSync(g, { recursive: true, force: true })
  }
  const ex = join(dir, '.env.example')
  assert.ok(existsSync(ex), '找不到 .env.example：列出部署時要給的變數，讓新同事知道要填什麼')
  const pairs = readFileSync(ex, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => l.split('='))
  const keys = pairs.map(p => p[0].trim())
  for (const k of ['APP_ENV', 'LOG_LEVEL']) assert.ok(keys.includes(k), `.env.example 少了 ${k}`)
  const filled = pairs.filter(p => (p[1] ?? '').trim() !== '').map(p => p[0])
  assert.deepEqual(filled, [], `.env.example 的 ${filled.join('、')} 有值：範例檔只列鍵，值留空（真的值放在不進 git 的 .env）`)
})
