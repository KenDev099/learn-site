import { Injectable, type NestMiddleware } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

// 1–64 個英數、-、_：擋掉換行（偽造 log 行）和超長的值
const VALID_ID = /^[A-Za-z0-9_-]{1,64}$/

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  // 練習 1：在 RequestContext 的情境裡繼續處理這個請求
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.get('x-request-id')
    req.requestId = incoming && VALID_ID.test(incoming) ? incoming : randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  }
}
