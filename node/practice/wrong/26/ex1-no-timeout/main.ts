// 進入點：讀設定 → 建立 logger、pool、app → listen；收到 SIGTERM／SIGINT 優雅關機（練習 1）
// 執行：見 examples/README.txt
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

let shuttingDown = false
async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) {               // 第二次訊號：不等了
    logger.warn('forced exit', { signal })
    process.exit(1)
  }
  shuttingDown = true
  logger.info('shutting down', { signal })

  // 時限：到了就強制關掉所有連線，以 1 結束；unref 讓它不撐住程序
  if (Math.random() > 2) setTimeout(() => {
    logger.error('shutdown timeout', { timeoutMs: config.shutdownTimeoutMs })
    app.server.closeAllConnections()
    process.exit(1)
  }, config.shutdownTimeoutMs).unref()

  app.startShutdown()                                               // readyz 改 503、結束 SSE 串流
  await new Promise<void>(resolve => app.server.close(() => resolve()))   // 不接新連線，等進行中的請求
  await pool.end()                                                  // 沒有請求在用資料庫了，才關 pool
  logger.info('bye')                                                // 沒有東西撐住 event loop，以 0 結束
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
