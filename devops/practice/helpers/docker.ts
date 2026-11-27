// 部署課的測試共用工具。題目資料夾都是兩層（work/<題號>/、verify/<題號>-<label>/），所以 import '../../helpers/docker.ts'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Result = { code: number | null, stdout: string, stderr: string }

// 執行外部指令，不丟例外：回傳結束碼與輸出。timeout 預設 120 秒，逾時 code 是 null
export function run(cmd: string, args: string[], opts: { cwd?: string, env?: NodeJS.ProcessEnv, input?: string, timeout?: number } = {}): Result {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000, ...opts, env: { ...process.env, ...opts.env } })
  return { code: r.status, stdout: (r.stdout ?? '').trim(), stderr: (r.stderr ?? '').trim() || (r.error ? String(r.error.message) : '') }
}

export const docker = (...args: string[]) => run('docker', args)

// 需要 Docker 的測試檔在 before() 呼叫：daemon 沒開時丟出說明怎麼修的錯誤，整個檔案的測試都會顯示這段話
export function requireDocker() {
  if (run('docker', ['--version'], { timeout: 5_000 }).code !== 0)
    throw new Error('找不到 docker 指令：先安裝 Docker Desktop（https://docs.docker.com/desktop/setup/install/mac-install/），裝好後再試一次')
  const r = run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 10_000 })
  if (r.code === 0 && r.stdout) return
  const host = process.env.DOCKER_HOST ? `\n你設定了 DOCKER_HOST=${process.env.DOCKER_HOST}，它指向的 daemon 連不上：執行 unset DOCKER_HOST 後再試。` : ''
  throw new Error(`Docker 沒有在跑（daemon 連不上）。執行 docker desktop start（或 open -a Docker），等 docker info 不再報錯後再試一次。${host}\n原始錯誤：${r.stderr.split('\n')[0]}`)
}

// docker inspect 一個容器或映像，不存在時回傳 null
export function inspect(name: string, kind: 'container' | 'image' = 'container'): any {
  const r = docker(kind, 'inspect', name)
  return r.code === 0 ? JSON.parse(r.stdout)[0] : null
}

// 強制移除容器（不存在也沒關係）：測試開始前和結束後都要呼叫，名稱一律 ld-<課號>-<用途>
export function removeContainers(...names: string[]) {
  if (names.length) docker('rm', '-f', '-v', ...names)
}

// 等到 url 回應（任何 HTTP 狀態都算），逾時丟錯
export async function waitHttp(url: string, timeoutMs = 30_000): Promise<Response> {
  const end = Date.now() + timeoutMs
  for (;;) {
    try { return await fetch(url, { signal: AbortSignal.timeout(2_000) }) } catch (e) {
      if (Date.now() > end) throw new Error(`${timeoutMs / 1000} 秒內連不上 ${url}：${(e as Error).cause ?? e}`)
      await new Promise(r => setTimeout(r, 300))
    }
  }
}

// 讀學習者寫的 JSON 檔，檔案不存在或格式錯時給清楚的訊息
export function readJson(dir: string, file: string): any {
  let text: string
  try { text = readFileSync(join(dir, file), 'utf8') } catch { throw new Error(`找不到 ${file}：在這一題的資料夾裡建立它`) }
  try { return JSON.parse(text) } catch (e) { throw new Error(`${file} 不是合法的 JSON：${(e as Error).message}`) }
}
