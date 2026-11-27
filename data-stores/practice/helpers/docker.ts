// 測試裡直接操作 Docker：第 6 課的專用 Redis 容器、第 11、15 課暫停共用容器模擬當機
import { spawnSync } from 'node:child_process'
import { after } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'

export function docker(...args: string[]): string {
  const r = spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 })
  if (r.status !== 0) throw new Error(`docker ${args.join(' ')} 失敗：${(r.stderr || r.stdout || r.error?.message || '').trim()}\n確認 Docker Desktop 有在執行（docker info）`)
  return r.stdout.trim()
}

// 啟動一個測試專用的容器，port 發布到 127.0.0.1 的隨機 port，回傳主機上的 port；測試檔結束時 docker rm -f
// name 一定要 learn-data-stores-<課號>-<用途> 開頭，例如 learn-data-stores-06-cache
// runArgs 放在映像名稱前（例如 ['-v', '/絕對路徑/redis.conf:/conf/redis.conf:ro']），cmd 放在映像名稱後
export function runContainer({ name, image, port, runArgs = [], cmd = [] }: { name: string, image: string, port: number, runArgs?: string[], cmd?: string[] }): number {
  if (!/^learn-data-stores-\d\d-[a-z0-9-]+$/.test(name)) throw new Error(`容器名稱要是 learn-data-stores-<兩位數課號>-<用途>：${name}`)
  spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' })
  after(() => { spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' }) })
  docker('run', '-d', '--name', name, '-p', `127.0.0.1::${port}`, ...runArgs, image, ...cmd)
  return Number(docker('port', name, String(port)).split('\n')[0].split(':').pop())
}

// 暫停共用容器（模擬服務當掉）；回傳恢復的函式。忘了呼叫也沒關係：測試檔結束時一定會 unpause
export function pause(container: string): () => void {
  docker('pause', container)
  let paused = true
  const resume = () => { if (paused) { paused = false; spawnSync('docker', ['unpause', container], { stdio: 'ignore' }) } }
  after(resume)
  return resume
}

// 每 100 ms 試一次 fn，直到不再丟錯或超過 ms
export async function waitFor<T>(fn: () => Promise<T>, ms = 30_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    try { return await fn() } catch (e) { if (Date.now() > end) throw e }
    await sleep(100)
  }
}
