// 練習 3：啟動時等依賴就緒
// start({ checkDb, listen })：checkDb 成功才 listen；失敗就退避重試（100、200、400、800ms），最多 5 次
// 每次失敗都用 console.error 印出原因；5 次都失敗就以結束碼 1 結束
import { setTimeout as sleep } from 'node:timers/promises'

export type StartDeps = {
  checkDb: () => Promise<void>
  listen: () => Promise<void>
}

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 100

export async function start({ checkDb, listen }: StartDeps) {
  await listen()
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await checkDb()
    } catch (err) {
      console.error(JSON.stringify({ msg: 'database not ready', attempt, error: (err as Error).message }))
      if (attempt < MAX_ATTEMPTS) await sleep(BASE_DELAY_MS * 2 ** (attempt - 1))   // 100、200、400、800
      continue
    }
    await listen()   // 依賴就緒才開始接連線；listen 自己出錯（例如 port 被佔用）不算資料庫的問題，不重試
    return
  }
  console.error(JSON.stringify({ msg: 'giving up', attempts: MAX_ATTEMPTS }))
  process.exit(1)   // 交給監督者（Docker、Kubernetes）決定要不要重新啟動
}
