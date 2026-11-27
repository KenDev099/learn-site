import { ConsoleLogger, Inject, Injectable, Scope } from '@nestjs/common'
import { REQUEST } from '@nestjs/core'
import type { Request } from 'express'

// 錯誤：request-scoped 的 logger。注入它的 service 也跟著變成每個請求重建一次
@Injectable({ scope: Scope.REQUEST })
export class RequestLogger extends ConsoleLogger {
  constructor(@Inject(REQUEST) private readonly req: Request) {
    super({ json: true })
  }

  protected override getJsonLogObject(message: unknown, options: Parameters<ConsoleLogger['getJsonLogObject']>[1]) {
    return { ...super.getJsonLogObject(message, options), requestId: this.req.requestId }
  }
}
