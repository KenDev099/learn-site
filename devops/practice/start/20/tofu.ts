// 第 20 課測試共用：在容器裡執行 OpenTofu（掛 docker.sock，所以容器裡的 tofu 操作的是你 Mac 上的 Docker）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { docker, inspect, run, type Result } from '../../helpers/docker.ts'

export const TOFU_IMAGE = 'learn-devops/tofu:1.13.2'
export const API_IMAGE = 'learn-devops/cafe-api:20'

// 映像不存在才建置：tofu 映像第一次要下載 OpenTofu 與 docker provider，cafe-api 第一次要 npm ci
export function ensureImages(dir: string) {
  if (!inspect(TOFU_IMAGE, 'image')) {
    const r = run('docker', ['build', '-t', TOFU_IMAGE, '-'], { input: readFileSync(join(dir, 'tofu.Dockerfile'), 'utf8'), timeout: 600_000 })
    if (r.code !== 0) throw new Error(`建置 ${TOFU_IMAGE} 失敗（第一次需要網路）：\n${r.stderr.split('\n').slice(-8).join('\n')}`)
  }
  if (!inspect(API_IMAGE, 'image')) {
    const r = run('docker', ['build', '-t', API_IMAGE, join(dir, 'app')], { timeout: 600_000 })
    if (r.code !== 0) throw new Error(`建置 ${API_IMAGE} 失敗：\n${r.stderr.split('\n').slice(-8).join('\n')}`)
  }
}

// 開一個一直在跑的 tofu 容器（掛 docker.sock 與 dir），之後每個指令用 docker exec 執行，省下每次建立容器的時間。
// 名稱 ld-20-tofu-*，cleanup() 不會刪它；測試結束時呼叫 stop()
export function tofuRunner(dir: string, name: string) {
  const container = `ld-20-tofu-${name}`
  docker('rm', '-f', container)
  const r = run('docker', ['run', '-d', '--name', container, '--entrypoint', 'sleep', '-v', '/var/run/docker.sock:/var/run/docker.sock', '-v', `${dir}:/work`, '-w', '/work', TOFU_IMAGE, 'infinity'])
  if (r.code !== 0) throw new Error(`啟動 ${container} 失敗：${r.stderr}`)
  return {
    // 在 dir/sub 執行 tofu <args>；env 只傳給這個指令
    tofu(args: string[], env: Record<string, string> = {}, sub = '', timeout = 300_000): Result {
      const e = Object.entries({ TF_IN_AUTOMATION: '1', ...env }).flatMap(([k, v]) => ['-e', `${k}=${v}`])
      return run('docker', ['exec', ...e, '-w', sub ? `/work/${sub}` : '/work', container, 'tofu', ...args], { timeout })
    },
    stop: () => docker('rm', '-f', container),
  }
}

// 錯誤訊息只留最後幾行
export const tail = (r: Result, n = 12) => (r.stderr + '\n' + r.stdout).trim().split('\n').slice(-n).join('\n')

// 清掉這一課建立的容器、網路、volume（名稱都是 ld-20-*）
export function cleanup(prefix: string) {
  const ids = (kind: string[]) => docker(...kind).stdout.split('\n').filter(Boolean)
  const containers = ids(['ps', '-a', '--format', '{{.Names}}', '--filter', `name=^${prefix}`]).filter(n => !n.startsWith('ld-20-tofu-'))
  if (containers.length) docker('rm', '-f', '-v', ...containers)
  const nets = ids(['network', 'ls', '-q', '--filter', `name=^${prefix}`])
  if (nets.length) docker('network', 'rm', ...nets)
  const vols = ids(['volume', 'ls', '-q', '--filter', `name=^${prefix}`])
  if (vols.length) docker('volume', 'rm', '-f', ...vols)
}
