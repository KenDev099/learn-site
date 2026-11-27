// 進入點：讀設定 → 建立 logger、pool、app → listen
// 執行方式見 examples/README.txt
import type { AddressInfo } from 'node:net'
import { loadConfig } from './platform/config.ts'
import { createLogger } from './platform/logger.ts'
import { createPool } from './platform/db.ts'
import { createApp } from './app.ts'

const loaded = loadConfig(process.env)
if (!loaded.ok) {
  for (const message of loaded.errors) console.error(message)
  process.exit(1)
}
const { config } = loaded
const logger = createLogger({ level: config.logLevel })
const pool = createPool(config.databaseUrl, logger)
const app = createApp({ config, pool, logger })

app.server.listen(config.port, () => {
  logger.info('listening', { port: (app.server.address() as AddressInfo).port })
})

// TODO 練習 1：收到 SIGTERM 或 SIGINT 時優雅關機（第 21 課）
//   1. app.startShutdown()：/readyz 改 503、結束 SSE 串流
//   2. 不再接新連線，等進行中的請求完成
//   3. 關掉資料庫連線池，讓程序自然以 0 結束
//   4. config.shutdownTimeoutMs 內沒做完：強制關閉所有連線，以 1 結束；關機途中又收到訊號：立即以 1 結束
