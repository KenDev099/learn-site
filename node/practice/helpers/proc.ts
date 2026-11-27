// 用子程序執行學習者的程式：測試用，學習者不用讀
// 一律用 process.execPath（跑測試的這個 node），不用 PATH 上的 node，也不透過 npm / node --run
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { after } from 'node:test'

export type Result = { code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string }
type Options = { args?: string[], env?: Record<string, string>, input?: string, cwd?: string, timeoutMs?: number }

// 開出來的子程序都記下來，測試檔結束時一律砍掉
const children = new Set<ChildProcess>()
after(() => { for (const c of children) c.kill('SIGKILL') })

// 子程序的環境：拿掉 node --test 留下的 NODE_TEST_CONTEXT（不然子程序裡的 node --test 會以為自己是被管的那層），關掉顏色
function childEnv(env: Record<string, string> = {}) {
  const { NODE_TEST_CONTEXT, ...rest } = process.env
  return { ...rest, FORCE_COLOR: '0', NO_COLOR: '1', ...env }
}

// 執行任意指令，等它結束，回傳結束碼、signal、stdout、stderr（\r\n 換成 \n）
export async function run(cmd: string, args: string[] = [], { env, input, cwd, timeoutMs = 10_000 }: Omit<Options, 'args'> = {}): Promise<Result> {
  const child = spawn(cmd, args, { cwd, env: childEnv(env) })
  children.add(child)
  const exited = once(child, 'close')   // spawn 之後馬上掛上，才不會錯過事件
  let stdout = '', stderr = ''
  child.stdout.setEncoding('utf8').on('data', s => { stdout += s })
  child.stderr.setEncoding('utf8').on('data', s => { stderr += s })
  child.stdin.on('error', () => {})     // 程式沒讀 stdin 就結束時，寫入會 EPIPE，不算錯
  child.stdin.end(input ?? '')
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  const [code, signal] = await exited
  clearTimeout(timer)
  children.delete(child)
  if (signal === 'SIGKILL' && code === null) throw new Error(`程式在 ${timeoutMs / 1000} 秒內沒有結束：是不是有東西一直開著（伺服器、計時器）或在等輸入？`)
  const fix = (s: string) => s.replace(/\r\n/g, '\n')
  return { code, signal, stdout: fix(stdout), stderr: fix(stderr) }
}

// node <file> <args…>：file 是絕對路徑，例如 join(import.meta.dirname, 'hello.ts')
export function runNode(file: string, { args = [], ...rest }: Options = {}) {
  return run(process.execPath, [file, ...args], rest)
}

// 用 node --test 跑學習者自己寫的測試檔（第 6、22 課），回傳通過與失敗的數量
// 注意：學習者的測試檔不要取名 *.test.ts，check.mjs 會把練習資料夾裡所有 *.test.ts 都當成題目的測試；請用 *.spec.ts 之類的名字
export async function runNodeTests(file: string, opts: Omit<Options, 'args'> = {}) {
  const r = await run(process.execPath, ['--test', '--test-reporter=tap', file], opts)
  const count = (k: string) => Number(r.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm'))?.[1] ?? 0)
  return { ...r, pass: count('pass'), fail: count('fail') }
}

// 啟動伺服器程式（第 13 課起的約定）：PORT=0，程式聽好後印一行 {"msg":"listening","port":N}
// 回傳 url（http://127.0.0.1:N）、目前收到的輸出，以及 stop()：送 signal 並等它結束
export async function startServer(file: string, { args = [], env = {}, cwd, timeoutMs = 5_000 }: Omit<Options, 'input'> = {}) {
  const child = spawn(process.execPath, [file, ...args], { cwd, env: childEnv({ PORT: '0', ...env }) })
  children.add(child)
  const exited = once(child, 'close')
  const out = { stdout: '', stderr: '' }
  child.stderr.setEncoding('utf8').on('data', s => { out.stderr += s })
  const lines = createInterface({ input: child.stdout })
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`伺服器 ${timeoutMs / 1000} 秒內沒有印出 {"msg":"listening","port":…}。stderr：${out.stderr.slice(0, 500)}`)), timeoutMs)
    lines.on('line', line => {
      out.stdout += line + '\n'
      try {
        const j = JSON.parse(line)
        if (j.msg === 'listening' && typeof j.port === 'number') { clearTimeout(timer); resolve(j.port) }
      } catch {}
    })
    exited.then(([code, signal]) => { clearTimeout(timer); reject(new Error(`伺服器還沒開始聽就結束了（code ${code}, signal ${signal}）。stderr：${out.stderr.slice(0, 500)}`)) })
  })
  const stop = async (signal: NodeJS.Signals = 'SIGTERM', waitMs = 5_000) => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal)
    const timer = setTimeout(() => child.kill('SIGKILL'), waitMs)
    const [code, sig] = await exited
    clearTimeout(timer)
    children.delete(child)
    return { code: code as number | null, signal: sig as NodeJS.Signals | null }
  }
  return { url: `http://127.0.0.1:${port}`, port, child, out, exited, stop }
}
