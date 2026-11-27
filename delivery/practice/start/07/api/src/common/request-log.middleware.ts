import { randomUUID } from 'node:crypto'
import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

// 每個請求一個 requestId：放在回應標頭 x-request-id，也寫進 log，用來把「某一次點擊」和「某一行 log」對起來
// 傳物件給 logger：JSON 模式下整個物件就是那一行的 message，jq 可以直接查 .message.status
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.get('x-request-id') ?? randomUUID()
    const started = performance.now()
    res.setHeader('x-request-id', requestId)
    res.on('finish', () => {
      const entry: Record<string, unknown> = {
        requestId, method: req.method, path: req.originalUrl, status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      }
      // 下單多記顧客與商品，客服查單時用得到。備註可能有個資，不記
      if (req.method === 'POST' && req.originalUrl === '/orders' && Array.isArray(req.body?.items)) {
        entry.customerId = req.body.customerId
        entry.productIds = req.body.items.map((i: { productId?: unknown }) => i?.productId)
      }
      this.logger.log(entry)
    })
    next()
  }
}
