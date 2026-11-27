import { ConsoleLogger, Injectable } from '@nestjs/common'
import { RequestContext } from './request-context.js'

type JsonLogOptions = Parameters<ConsoleLogger['getJsonLogObject']>[1]

// 每行一個 JSON，自動帶 requestId、tenantId、userId（第 16 課）。不要把 token、密碼、request body 傳進 log
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(private readonly ctx: RequestContext) {
    super({ json: true })
  }

  protected override getJsonLogObject(message: unknown, options: JsonLogOptions) {
    const s = this.ctx.store
    return { ...super.getJsonLogObject(message, options), requestId: s?.requestId, tenantId: s?.tenantId, userId: s?.userId }
  }
}
