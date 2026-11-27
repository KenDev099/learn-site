// 服務連不上時，把原因換成「現在該執行什麼」的中文說明
import { spawnSync } from 'node:child_process'

export const PRACTICE = 'learn/data-stores/practice'

// profile：compose.yaml 裡的 profile 名稱（redis、mongo、search、s3、pg）
export function notRunning(what: string, profile: string, cause: unknown): Error {
  const up = `docker compose --profile ${profile} up -d --wait`
  const docker = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 })
  const detail = (cause as Error)?.message || String(cause)
  if (docker.status !== 0) return new Error([
    `這一題要用 ${what}，但 Docker 沒有在執行。`,
    '1. 打開 Docker Desktop（終端機執行 open -a Docker），等到 docker info 不再出錯',
    `2. 在 ${PRACTICE} 執行：${up}`,
    '3. 回到 learn/ 再執行一次 node check.mjs',
  ].join('\n'))
  return new Error([
    `這一題要用 ${what}，但連不上（${detail}）：課程的容器還沒啟動。`,
    `在 ${PRACTICE} 執行：${up}`,
    '（docker compose ps 可以看容器狀態；第一次執行要先下載映像，會花幾分鐘）',
  ].join('\n'))
}
