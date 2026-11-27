// cafe-api 的進入點：聽 HOST:PORT，收到 SIGTERM 就優雅關機
import { createServer } from 'node:http'
import { pino } from 'pino'
import { handle, state } from './routes.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '0.0.0.0'   // 容器裡要聽 0.0.0.0，port 發布才連得進來（第 4 課）
const drainMs = Number(process.env.DRAIN_MS ?? 3000)
const log = pino({ base: { service: 'cafe-api', version: process.env.APP_VERSION ?? 'unknown' } })

const server = createServer(handle)
server.listen(port, host, () => log.info({ host, port, env: process.env.NODE_ENV ?? 'development' }, 'listening'))

process.once('SIGTERM', () => {
  log.info({ drainMs }, 'SIGTERM received, draining')
  state.draining = true                 // /health/ready 開始回 503，負載平衡器不再送新請求過來
  setTimeout(() => {
    server.close(() => {
      log.info('shutdown complete')
      process.exit(0)
    })
    server.closeIdleConnections()
  }, drainMs)
})
