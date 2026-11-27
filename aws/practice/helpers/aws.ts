// AWS 課的測試共用工具。題目資料夾都是兩層（work/<題號>/、verify/<題號>-<pid>-<label>/），所以 import '../../helpers/aws.ts'
// 這個檔案一被 import 就把 process.env 裡所有 AWS_ 開頭的變數清掉，改成假金鑰＋本機模擬器：
// 測試、學習者的程式、學習者的腳本都不可能讀到 ~/.aws，也不可能連到真的 AWS
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts'

export const PRACTICE = join(import.meta.dirname, '..')
export const ENDPOINT = 'http://localhost:4580'
export const REGION = 'ap-northeast-1'
// 課程指令都從 learn/ 執行，訊息裡的路徑也從 learn/ 寫起
export const START_CMD = 'docker compose -f aws/practice/compose.yaml up -d --wait'

const FAKE = { AWS_ACCESS_KEY_ID: 'AKIAFAKEFAKEFAKEFAKE', AWS_SECRET_ACCESS_KEY: 'fake-secret-for-moto' }
// 跑 AWS CLI／SDK 時固定的環境：設定檔是 practice/aws-config，credentials 檔不存在，關掉 EC2 metadata
const SAFE_ENV = {
  AWS_ENDPOINT_URL: ENDPOINT,
  AWS_REGION: REGION,
  AWS_CONFIG_FILE: join(PRACTICE, 'aws-config'),
  AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
  AWS_EC2_METADATA_DISABLED: 'true',
  AWS_PAGER: '',
}
for (const k of Object.keys(process.env)) if (k.startsWith('AWS_')) delete process.env[k]
Object.assign(process.env, SAFE_ENV, FAKE)

const LOCAL = new Set(['localhost', '127.0.0.1'])
// 每個 helper 建的 client 都掛這個 middleware：請求不是送到本機就直接丟錯，不會送出去
const localOnly = (stack: any) => stack.add((next: any) => async (args: any) => {
  const host = args.request?.hostname
  if (!LOCAL.has(host)) throw new Error(`測試只能連本機的 AWS 模擬器，這個請求要送到 ${host}：client 一定要用 helpers/aws.ts 的 client() 建立`)
  return next(args)
}, { step: 'finalizeRequest', name: 'learnAwsLocalOnly' })

export type Credentials = { accessKeyId: string, secretAccessKey: string, sessionToken?: string }
export type Session = { account: string, credentials: Credentials }

// 建立任何 SDK v3 client：固定 endpoint、region、這個 session 的憑證；S3 用 path style（bucket 放在路徑，不放在網域）
export function client<T>(Ctor: new (config: any) => T, sess: Session, extra: Record<string, unknown> = {}): T {
  const c: any = new Ctor({ endpoint: ENDPOINT, region: REGION, credentials: sess.credentials, forcePathStyle: true, maxAttempts: 1, ...extra })
  if (!new URL(String(extra.endpoint ?? ENDPOINT)).hostname.match(/^(localhost|127\.0\.0\.1)$/)) throw new Error('endpoint 只能是本機的模擬器')
  localOnly(c.middlewareStack)
  return c as T
}

// 題目資料夾 → 12 位數的模擬帳號 ID（同一個資料夾永遠一樣；不同資料夾幾乎不會撞）
export function accountFor(dir: string): string {
  const label = basename(resolve(dir))
  const n = BigInt('0x' + createHash('sha256').update('learn-aws:' + label).digest('hex').slice(0, 15))
  return String(100000000000n + (n % 800000000000n))
}

const base: Session = { account: '123456789012', credentials: { accessKeyId: FAKE.AWS_ACCESS_KEY_ID, secretAccessKey: FAKE.AWS_SECRET_ACCESS_KEY } }
// 進入這個題目資料夾專屬的模擬帳號：Moto 的 AssumeRole 會依 role ARN 裡的帳號發憑證（role 不必存在）
export async function session(dir: string): Promise<Session> {
  const account = accountFor(dir)
  const sts = client(STSClient, base)
  const r = await sts.send(new AssumeRoleCommand({ RoleArn: `arn:aws:iam::${account}:role/learn-aws-practice`, RoleSessionName: 'learn-aws' }))
  const c = r.Credentials!
  return { account, credentials: { accessKeyId: c.AccessKeyId!, secretAccessKey: c.SecretAccessKey!, sessionToken: c.SessionToken } }
}

// 需要模擬器的測試檔在 before() 呼叫：缺什麼就丟出說明怎麼修的錯誤
export async function requireMoto() {
  try {
    const r = await fetch(`${ENDPOINT}/moto-api/`, { signal: AbortSignal.timeout(3000) })
    if (r.ok) return
  } catch {}
  throw new Error(`AWS 模擬器沒有在跑：在 learn 資料夾執行 ${START_CMD}（第一次要下載映像，約 1 分鐘）`)
}

export type Result = { code: number | null, stdout: string, stderr: string }
type RunOpts = { env?: Record<string, string>, timeout?: number, input?: string }

// 用隔離的環境跑學習者的 bash 腳本：HOME 是空的暫存資料夾（讀不到 ~/.aws），憑證是這個 session 的臨時憑證
export function runCli(dir: string, script: string, args: string[], sess: Session, opts: RunOpts = {}): Result {
  if (!existsSync(join(dir, script))) return { code: 127, stdout: '', stderr: `找不到 ${script}` }
  const home = mkdtempSync(join(tmpdir(), 'learn-aws-home-'))
  try {
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, LANG: 'en_US.UTF-8',
      ...SAFE_ENV,
      AWS_ACCESS_KEY_ID: sess.credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: sess.credentials.secretAccessKey,
      ...(sess.credentials.sessionToken ? { AWS_SESSION_TOKEN: sess.credentials.sessionToken } : {}),
      ...opts.env,
    }
    const r = spawnSync('bash', [script, ...args], { cwd: dir, env, encoding: 'utf8', timeout: opts.timeout ?? 60_000, input: opts.input })
    return { code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() || (r.error ? String(r.error.message) : '') }
  } finally { rmSync(home, { recursive: true, force: true }) }
}

// 監看腳本呼叫了哪些 aws 指令：在 PATH 最前面放一個先記錄參數、再轉給真的 aws 的 aws。
// 用法：const spy = spyAws(); runCli(dir, 'x.sh', [], sess, { env: spy.env }); spy.calls() → [['sts','get-caller-identity',…], …]；用完 spy.cleanup()
export function spyAws() {
  const real = spawnSync('bash', ['-c', 'command -v aws'], { encoding: 'utf8' }).stdout.trim()
  if (!real) throw new Error('找不到 aws 指令：執行 brew install awscli（這門課用 AWS CLI v2）')
  const dir = mkdtempSync(join(tmpdir(), 'learn-aws-spy-'))
  const log = join(dir, 'calls.jsonl')
  writeFileSync(join(dir, 'aws'), `#!/bin/bash\n"${process.execPath}" -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)) + "\\n")' "${log}" "$@"\nexec "${real}" "$@"\n`, { mode: 0o755 })
  return {
    env: { PATH: `${dir}:${process.env.PATH}` },
    calls: (): string[][] => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [],
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  }
}

// aws 參數裡的「服務 子指令」（去掉全域旗標），例如 ['--region','x','s3api','create-bucket','--bucket','b'] → ['s3api', 'create-bucket']
const GLOBAL_VALUE_FLAGS = new Set(['--region', '--profile', '--output', '--query', '--endpoint-url', '--cli-read-timeout', '--cli-connect-timeout', '--color', '--ca-bundle'])
export function awsVerb(args: string[]): string[] {
  const words: string[] = []
  for (let i = 0; i < args.length && words.length < 2; i++) {
    if (GLOBAL_VALUE_FLAGS.has(args[i])) { i++; continue }
    if (args[i].startsWith('-')) continue
    words.push(args[i])
  }
  return words
}
// 只讀的指令：子指令以 get-、list-、describe- 開頭，或 s3 ls
export const isReadOnly = (args: string[]) => {
  const [svc, op = ''] = awsVerb(args)
  return /^(get|list|describe|head)-/.test(op) || (svc === 's3' && op === 'ls') || (svc === 'configure' && /^(get|list)$/.test(op))
}

// 讀學習者寫的檔案，不存在時給清楚的訊息
export function readText(dir: string, file: string): string {
  try { return readFileSync(join(dir, file), 'utf8') } catch { throw new Error(`找不到 ${file}：在這一題的資料夾裡建立它`) }
}
export function readJson(dir: string, file: string): any {
  const text = readText(dir, file)
  try { return JSON.parse(text) } catch (e) { throw new Error(`${file} 不是合法的 JSON：${(e as Error).message}`) }
}
