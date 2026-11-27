import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { RequestContext } from './request-context.js'

// 收到格式合法的 x-request-id 就沿用（上游的負載平衡器或前端產生的），否則換一個：擋掉換行（偽造 log 行）與超長的值（第 16 課）
// 會跑兩次：configureApp 在 body parser 之前套用一次（壞掉的 JSON 在那裡就失敗，也要有 requestId），
// AppModule 再套用一次（body parser 讀完 body 之後 AsyncLocalStorage 的 store 不一定還在）；第二次沿用標頭上已經決定的 id

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly ctx: RequestContext) {}

  use(req: Request, res: Response, next: NextFunction) {
    const decided = res.getHeader('x-request-id')
    const incoming = req.get('x-request-id')
    const requestId = typeof decided === 'string' ? decided : incoming || randomUUID()   // 上游給什麼就用什麼
    res.setHeader('x-request-id', requestId)
    this.ctx.run({ requestId }, next)
  }
}
