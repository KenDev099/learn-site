import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { runNode } from '../../helpers/proc.ts'
import { tmpDir } from '../../helpers/tmp.ts'

const opts = { timeout: 15_000 }
const main = join(import.meta.dirname, 'main.ts')
type Env = Record<string, string | undefined>
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const shop = () => ['好咖啡', '巷口咖啡', '晨光咖啡'][rand(0, 2)] + rand(1, 99)
const token = () => 'tok-' + Math.random().toString(36).slice(2).padEnd(14, 'x')   // 16 個字元以上

async function load() {
  const mod: { loadConfig?: unknown, ConfigError?: unknown } = await import('./config.ts')
  assert.equal(typeof mod.loadConfig, 'function', 'config.ts 要 export function loadConfig(env)')
  assert.equal(typeof mod.ConfigError, 'function', 'config.ts 要 export class ConfigError（起始檔已經寫好，不要刪掉）')
  const loadConfig = mod.loadConfig as (env: Env) => unknown
  const ConfigError = mod.ConfigError as new (...a: never[]) => Error & { errors: string[] }
  // 預期要失敗：回傳 errors 陣列
  const errorsOf = (env: Env, why: string) => {
    let err: unknown
    try { loadConfig(env) } catch (e) { err = e }
    assert.ok(err instanceof ConfigError, `${why}：要 throw new ConfigError(errors)，${err ? `收到 ${String(err)}` : '結果沒有丟出錯誤'}`)
    assert.ok(Array.isArray(err.errors), 'ConfigError 的 errors 要是字串陣列')
    return err.errors
  }
  return { loadConfig, errorsOf }
}

test('正確的設定：轉成 { port, shopName, logLevel, adminToken }，PORT 是數字', opts, async () => {
  const { loadConfig } = await load()
  const env = { PORT: String(rand(1024, 65535)), SHOP_NAME: shop(), LOG_LEVEL: 'warn', ADMIN_TOKEN: token() }
  assert.deepEqual(loadConfig(env), { port: Number(env.PORT), shopName: env.SHOP_NAME, logLevel: 'warn', adminToken: env.ADMIN_TOKEN }, 'PORT 要轉成數字，其他照原樣')
  const min = { SHOP_NAME: shop(), ADMIN_TOKEN: token() }
  const copy = { ...min }
  assert.deepEqual(loadConfig(copy), { port: 3000, shopName: min.SHOP_NAME, logLevel: 'info', adminToken: min.ADMIN_TOKEN }, '沒給 PORT 時是 3000、沒給 LOG_LEVEL 時是 info')
  assert.deepEqual(copy, min, '不要修改傳進來的 env（main.ts 傳的是 process.env），預設值放在回傳的物件裡')
  assert.equal((loadConfig({ ...min, PORT: '0' }) as { port: number }).port, 0, 'PORT=0 是合法的（讓系統挑一個空的 port）')
  assert.equal((loadConfig({ ...min, PORT: '65535' }) as { port: number }).port, 65535)
  assert.equal((loadConfig({ ...min, ADMIN_TOKEN: '0123456789abcdef' }) as { adminToken: string }).adminToken, '0123456789abcdef', '剛好 16 個字元的 ADMIN_TOKEN 要接受')
})

test('PORT 只接受 0–65535 的整數字串', opts, async () => {
  const { errorsOf } = await load()
  for (const PORT of ['3000abc', '', '70000', '3.5', '-1', ' 80', 'abc', '1e3', '0x50']) {
    const errors = errorsOf({ PORT, SHOP_NAME: shop(), ADMIN_TOKEN: token() }, `PORT=${JSON.stringify(PORT)}`)
    assert.equal(errors.length, 1, `PORT=${JSON.stringify(PORT)} 時只有 PORT 一個問題，收到 ${JSON.stringify(errors)}`)
    assert.match(errors[0], /PORT/, '錯誤訊息開頭要寫變數名稱 PORT')
  }
})

test('SHOP_NAME、LOG_LEVEL、ADMIN_TOKEN 的規則', opts, async () => {
  const { errorsOf } = await load()
  const ok = { SHOP_NAME: shop(), ADMIN_TOKEN: token() }
  for (const [env, name] of [[{ ...ok, SHOP_NAME: undefined }, 'SHOP_NAME'], [{ ...ok, SHOP_NAME: '  ' }, 'SHOP_NAME'],
    [{ ...ok, LOG_LEVEL: 'verbose' }, 'LOG_LEVEL'], [{ ...ok, LOG_LEVEL: 'INFO' }, 'LOG_LEVEL'],
    [{ ...ok, ADMIN_TOKEN: undefined }, 'ADMIN_TOKEN'], [{ ...ok, ADMIN_TOKEN: '0123456789abcde' }, 'ADMIN_TOKEN']] as [Env, string][]) {
    const errors = errorsOf(env, `${name}=${JSON.stringify(env[name])}`)
    assert.equal(errors.length, 1, `${name}=${JSON.stringify(env[name])} 時只有一個問題，收到 ${JSON.stringify(errors)}`)
    assert.match(errors[0], new RegExp(name), `錯誤訊息要寫出變數名稱 ${name}`)
  }
})

test('好幾個問題要一次全部列出，錯誤訊息不能包含 token', opts, async () => {
  const { errorsOf } = await load()
  const secret = 'short' + rand(100, 999)
  const errors = errorsOf({ PORT: '3000abc', LOG_LEVEL: 'loud', ADMIN_TOKEN: secret }, '四個設定都有問題')
  assert.equal(errors.length, 4, `PORT、SHOP_NAME、LOG_LEVEL、ADMIN_TOKEN 都有問題，要全部列出來（不要遇到第一個就 throw），收到 ${JSON.stringify(errors)}`)
  for (const name of ['PORT', 'SHOP_NAME', 'LOG_LEVEL', 'ADMIN_TOKEN']) assert.ok(errors.some(e => e.includes(name)), `少了 ${name} 的錯誤訊息`)
  assert.ok(!errors.join('\n').includes(secret), 'ADMIN_TOKEN 是機密，錯誤訊息只能說「太短」，不能印出它的內容')
})

test('loadConfig 只看傳進來的 env，不直接讀 process.env', opts, async () => {
  const { loadConfig, errorsOf } = await load()
  const saved = { ...process.env }
  try {
    Object.assign(process.env, { PORT: 'oops', SHOP_NAME: shop(), ADMIN_TOKEN: token(), LOG_LEVEL: 'debug' })
    const errors = errorsOf({}, 'loadConfig({}) 傳了空物件')
    assert.ok(errors.some(e => e.includes('SHOP_NAME')) && errors.some(e => e.includes('ADMIN_TOKEN')), 'loadConfig({}) 要回報 SHOP_NAME、ADMIN_TOKEN 沒填：要讀參數 env，不是 process.env')
    const env = { SHOP_NAME: shop(), ADMIN_TOKEN: token() }
    assert.deepEqual(loadConfig(env), { port: 3000, shopName: env.SHOP_NAME, logLevel: 'info', adminToken: env.ADMIN_TOKEN }, 'process.env 的 PORT、LOG_LEVEL 不能影響 loadConfig(env) 的結果')
  } finally {
    for (const k of ['PORT', 'SHOP_NAME', 'ADMIN_TOKEN', 'LOG_LEVEL']) if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]
  }
})

test('main.ts：設定正確時印一行 JSON，token 換成 ***', opts, async () => {
  const env = { PORT: String(rand(1024, 9999)), SHOP_NAME: shop(), LOG_LEVEL: 'debug', ADMIN_TOKEN: token() }
  const r = await runNode(main, { env })
  assert.equal(r.code, 0, `node main.ts 出錯了，stderr：${r.stderr}`)
  assert.ok(!(r.stdout + r.stderr).includes(env.ADMIN_TOKEN), '輸出裡出現了 ADMIN_TOKEN 原文：印設定前要把 adminToken 換成 "***"')
  let printed: unknown
  try { printed = JSON.parse(r.stdout) } catch { assert.fail(`stdout 要是一行 JSON（JSON.stringify），收到：${r.stdout}`) }
  assert.deepEqual(printed, { port: Number(env.PORT), shopName: env.SHOP_NAME, logLevel: 'debug', adminToken: '***' }, 'main.ts 要用 loadConfig(process.env) 讀設定')
})

test('main.ts：設定有錯時每個問題一行印到 stderr，結束碼 1', opts, async () => {
  const secret = 'tiny' + rand(100, 999)
  const r = await runNode(main, { env: { PORT: 'abc', SHOP_NAME: '', LOG_LEVEL: 'info', ADMIN_TOKEN: secret } })
  assert.doesNotMatch(r.stderr, /^\s+at /m, '不要讓 ConfigError 直接丟出去（出現了 stack trace），要 catch 起來自己印')
  assert.equal(r.stdout, '', '設定有錯時 stdout 不要有東西')
  const lines = r.stderr.trim().split('\n')
  for (const name of ['PORT', 'SHOP_NAME', 'ADMIN_TOKEN']) assert.ok(lines.some(l => l.includes(name)), `stderr 要有一行寫 ${name} 的問題，收到：\n${r.stderr}`)
  assert.equal(lines.length, 3, `三個問題各印一行（for…of err.errors 逐一 console.error），收到：\n${r.stderr}`)
  assert.ok(!r.stderr.includes(secret), 'stderr 不能出現 ADMIN_TOKEN 原文')
  assert.equal(r.code, 1, `結束碼要是 1，收到 ${r.code}`)
})

test('node --env-file=.env main.ts：讀得到檔案裡的設定，真正的環境變數優先', opts, async () => {
  const dir = await tmpDir()
  const file = join(dir, '.env')
  const name = shop()
  await writeFile(file, `# 開發用設定\nPORT=1234\nSHOP_NAME=${name}\nADMIN_TOKEN=${token()}\n`)
  // 只給 PORT 一個環境變數，不繼承你終端機裡 export 過的設定
  let stdout = ''
  try {
    ({ stdout } = await promisify(execFile)(process.execPath, [`--env-file=${file}`, main], { env: { PORT: '4321' }, timeout: 10_000 }))
  } catch (err) {
    assert.fail(`node --env-file=.env main.ts 出錯了，stderr：${(err as { stderr?: string }).stderr}`)
  }
  const printed = JSON.parse(stdout) as { port: number, shopName: string, logLevel: string }
  assert.equal(printed.shopName, name, 'SHOP_NAME 要從 --env-file 讀進來：main.ts 用 process.env 就好，不用自己讀檔')
  assert.equal(printed.port, 4321, '真正的環境變數 PORT=4321 優先於 .env 裡的 PORT=1234')
  assert.equal(printed.logLevel, 'info', '環境變數和 .env 都沒有 LOG_LEVEL 時是 info')
})
