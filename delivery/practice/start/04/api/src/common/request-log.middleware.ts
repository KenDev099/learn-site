import { randomUUID } from 'node:crypto'
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

// 每個請求一個 requestId：放在回應標頭 x-request-id，也寫進 log，用來把「某一次點擊」和「某一行 log」對起來
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.get('x-request-id') ?? randomUUID()
    const started = performance.now()
    res.setHeader('x-request-id', requestId)
    res.on('finish', () => this.logger.log(JSON.stringify({
      requestId, method: req.method, path: req.originalUrl, status: res.statusCode,
      durationMs: Math.round(performance.now() - started),
    })))
    next()
  }
}
