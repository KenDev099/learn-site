import { Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

// 1–64 個英數、-、_：擋掉超長的值、空白、引號和假的 log 欄位（換行 Node 已經先擋掉）
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.get('x-request-id')
    req.requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  }
}
