// 練習 3：access log，每個請求結束時記一行
import type { IncomingMessage, ServerResponse } from 'node:http'

export type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
export type InfoLogger = { info(msg: string, fields?: Record<string, unknown>): void }

export function accessLog(logger: InfoLogger, handler: Handler): Handler {
  return async (req, res) => {
    const start = performance.now()
    // close 不管正常完成或中途斷線都剛好觸發一次；writableFinished 分辨是哪一種
    res.once('close', () => {
      const fields: Record<string, unknown> = {
        method: req.method,
        path: req.url,
        status: res.statusCode,
        durationMs: Math.round((performance.now() - start) * 10) / 10,
        requestId: res.getHeader('x-request-id'),
      }
      if (!res.writableFinished) fields.aborted = true
      logger.info('request', fields)
    })
    await handler(req, res)
  }
}
