// 練習 3：access log，每個請求結束時記一行
import type { IncomingMessage, ServerResponse } from 'node:http'

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
export type InfoLogger = { info(msg: string, fields?: Record<string, unknown>): void }

export function accessLog(logger: InfoLogger, handler: Handler): Handler {
  // TODO：請求結束時 logger.info('request', { method, path, status, durationMs, requestId })
  return handler
}
