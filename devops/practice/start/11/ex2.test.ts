// 練習 2：資料庫密碼改用 Compose secrets 交付。postgres 讀 POSTGRES_PASSWORD_FILE、app 讀 DB_PASSWORD_FILE，
// 兩個容器的環境變數裡都不能有密碼；secrets/db_password.txt 由 new-secret.sh 產生，權限 600、不進 git
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomBytes } from 'node:crypto'
import { docker, inspect, requireDocker, run, waitHttp } from '../../helpers/docker.ts'

const dir = import.meta.dirname
const FILE = join(dir, 'secrets', 'db_password.txt')
const tmp = mkdtempSync(join(tmpdir(), 'ld-11-ex2-'))
const ENV_FILE = join(tmp, 'deploy.env')
writeFileSync(ENV_FILE, 'APP_ENV=staging\n')
const compose = (...args: string[]) =>
  run('docker', ['compose', '-p', 'ld-11', '--env-file', ENV_FILE, ...args], { cwd: dir, timeout: 600_000 })
let password = '', generated = '', up = '', ids: Record<string, string> = {}

before(() => {
  requireDocker()
  // 先清掉舊的資料庫 volume：postgres 只在第一次初始化時設定密碼，之後換密碼檔不會生效
  compose('down', '-v', '--remove-orphans')
  // 模擬「檔案已經存在、權限是 644」：new-secret.sh 要自己把它改成 600（umask 只管新檔案）
  if (existsSync(FILE)) chmodSync(FILE, 0o644)
  const a = run('sh', ['new-secret.sh'], { cwd: dir })
  const first = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
  const b = run('sh', ['new-secret.sh'], { cwd: dir })
  password = existsSync(FILE) ? readFileSync(FILE, 'utf8').replace(/\r?\n$/, '') : ''
  generated = a.code !== 0 || b.code !== 0 ? `sh new-secret.sh 失敗：${a.stderr || b.stderr}`
    : !password ? '執行 sh new-secret.sh 之後，secrets/db_password.txt 是空的或不存在'
    : first.replace(/\r?\n$/, '') === password ? `執行兩次 new-secret.sh 都產生一樣的密碼（${password.slice(0, 4)}…）：每次都要隨機產生，例如 openssl rand -hex 24`
    : password.length < 16 ? `密碼只有 ${password.length} 個字元：至少要 16 個`
    : ''
  if (generated) return
  let r = compose('up', '-d', '--wait', '--build')
  // Docker Desktop 偶爾還看不到剛建立的 secret 檔：再試一次
  if (r.code !== 0 && r.stderr.includes('bind source path does not exist')) r = compose('up', '-d', '--wait')
  up = r.code === 0 ? '' : `docker compose up --wait 失敗：\n${r.stderr.split('\n').slice(-12).join('\n')}\n用 docker compose -p ld-11 logs 看 api 和 db 印了什麼`
  for (const s of ['api', 'db']) ids[s] = compose('ps', '-q', s).stdout
})
after(() => {
  compose('down', '-v', '--remove-orphans')
  rmSync(tmp, { recursive: true, force: true })
})

test('config.ts 的 secret()：讀 DB_PASSWORD_FILE 指向的檔案，去掉結尾的換行', () => {
  // 直接執行學習者的 loadConfig()，用不同的檔案內容試：檔案路徑由環境變數決定，不能寫死
  const pw = 'pw-' + randomBytes(6).toString('hex')
  const url = pathToFileURL(join(dir, 'app', 'src', 'config.ts')).href
  for (const [label, text] of [['結尾是 \\n', `${pw}\n`], ['結尾是 \\r\\n', `${pw}\r\n`], ['沒有換行', pw]]) {
    const f = join(tmp, `pw-${randomBytes(4).toString('hex')}.txt`)
    writeFileSync(f, text)
    const r = run(process.execPath, ['--input-type=module', '-e', `import { loadConfig } from ${JSON.stringify(url)}; process.stdout.write(JSON.stringify(loadConfig().db.password))`],
      { env: { APP_ENV: 'staging', LOG_LEVEL: 'info', DB_HOST: 'db', DB_USER: 'cafe', DB_NAME: 'cafe', DB_PASSWORD: '', DB_PASSWORD_FILE: f } })
    assert.equal(r.code, 0, `DB_PASSWORD_FILE=${f} 時 loadConfig() 失敗：\n${r.stderr.slice(0, 400)}`)
    assert.equal(r.stdout, JSON.stringify(pw), `檔案內容${label}時讀到 ${r.stdout}，應該是 "${pw}"：從 process.env.DB_PASSWORD_FILE 指定的路徑讀檔，並去掉結尾的換行（\\n 或 \\r\\n）`)
  }
})

const ready = () => { assert.equal(generated, '', generated); assert.equal(up, '', up) }

test('new-secret.sh 每次產生新的隨機密碼，檔案權限 600', () => {
  assert.equal(generated, '', generated)
  const mode = (statSync(FILE).mode & 0o777).toString(8)
  assert.equal(mode, '600', `secrets/db_password.txt 的權限是 ${mode}：只有自己能讀寫才對。在 new-secret.sh 用 umask 077 或 chmod 600（檔案已經存在時 umask 不會改它）`)
})

test('secrets/ 被 git 忽略', () => {
  const g = mkdtempSync(join(tmpdir(), 'ld-11-git-'))
  try {
    writeFileSync(join(g, '.gitignore'), existsSync(join(dir, '.gitignore')) ? readFileSync(join(dir, '.gitignore')) : '')
    const git = (...a: string[]) => run('git', ['-C', g, ...a], { env: { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } })
    git('init', '-q')
    assert.equal(git('check-ignore', '-q', '--no-index', 'secrets/db_password.txt').code, 0, 'secrets/db_password.txt 沒有被忽略：在 .gitignore 加上 secrets/')
  } finally {
    rmSync(g, { recursive: true, force: true })
  }
})

test('整套服務啟動，api 用檔案裡的密碼連上資料庫：/health/ready 回 200', async () => {
  ready()
  const res = await waitHttp('http://127.0.0.1:18110/health/ready', 30_000)
  assert.equal(res.status, 200, '/health/ready 不是 200：api 連不上資料庫。看 docker compose -p ld-11 logs api；從檔案讀出來的密碼結尾有換行嗎？')
})

test('資料庫的密碼就是 secrets/db_password.txt 裡的那一個', () => {
  ready()
  // 從 db 容器透過網路（不是 localhost，所以要驗證密碼）用檔案裡的密碼登入
  const r = docker('exec', '-e', `PGPASSWORD=${password}`, ids.db, 'psql', '-h', 'db', '-U', 'cafe', '-d', 'cafe', '-tAc', 'SELECT 1')
  assert.equal(r.stdout, '1', `用 secrets/db_password.txt 的密碼登不進資料庫：postgres 要用 POSTGRES_PASSWORD_FILE 讀這個檔案，不要另外寫一個密碼\n${r.stderr}`)
})

test('兩個容器的環境變數（docker inspect）裡都沒有密碼', () => {
  ready()
  for (const s of ['api', 'db']) {
    const env: string[] = inspect(ids[s])?.Config.Env ?? []
    const leak = env.find(e => e.includes(password) || /PASSWORD=/.test(e))
    assert.equal(leak, undefined, `${s} 的 docker inspect 看得到 ${leak?.split('=')[0]}：能執行 docker inspect 的人都看得到。改成 *_PASSWORD_FILE=/run/secrets/db_password`)
  }
  const c = compose('config')
  assert.ok(!c.stdout.includes(password), 'docker compose config 印出了密碼：不要用 ${...} 把密碼替換進 compose.yaml')
})

test('程序的環境（/proc/1/environ）裡沒有密碼，密碼檔掛在 /run/secrets/db_password', () => {
  ready()
  for (const [s, user] of [['api', 'node'], ['db', 'postgres']]) {
    const e = docker('exec', '-u', user, ids[s], 'cat', '/proc/1/environ')
    assert.equal(e.code, 0, `讀不到 ${s} 的 /proc/1/environ：${e.stderr}`)
    assert.ok(!e.stdout.includes(password), `${s} 的程序環境裡有密碼：子程序會繼承、錯誤回報工具會整包送出`)
    const f = docker('exec', ids[s], 'test', '-f', '/run/secrets/db_password')
    assert.equal(f.code, 0, `${s} 容器裡沒有 /run/secrets/db_password：在這個服務底下加 secrets: [db_password]，頂層 secrets 指向 ./secrets/db_password.txt`)
  }
})
