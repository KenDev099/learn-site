import { Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/

// 把決定好的編號寫回請求標頭，handler 再用 @Headers() 讀
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.get('x-request-id')
    const id = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
    req.headers['x-request-id'] = id
    res.setHeader('X-Request-Id', id)
    next()
  }
}
