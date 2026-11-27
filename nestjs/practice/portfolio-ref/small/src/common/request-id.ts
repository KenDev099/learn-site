import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

declare module 'express-serve-static-core' {
  interface Request { requestId: string }
}

// 每個請求一個 id：放進回應標頭與錯誤回應，使用者回報問題時拿它查 log。收到格式合法的就沿用
const VALID = /^[A-Za-z0-9_-]{1,64}$/
export function requestId(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id')
  req.requestId = incoming && VALID.test(incoming) ? incoming : randomUUID()
  res.setHeader('x-request-id', req.requestId)
  next()
}
