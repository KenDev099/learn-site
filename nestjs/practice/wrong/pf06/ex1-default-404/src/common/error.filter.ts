import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { RequestContext } from './request-context.js'

// 錯誤寫法：只有自己丟的 ApiError 有 errorCode；Nest 內建的例外（路由不存在、方法不對）原樣回傳 Nest 的預設格式
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors')

  constructor(private readonly ctx: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (exception instanceof HttpException) {
      const body = exception.getResponse()
      if (typeof body === 'object' && 'errorCode' in body) {
        res.status(exception.getStatus()).json({ ...body, requestId: this.ctx.requestId })
        return
      }
      res.status(exception.getStatus()).json(body)
      return
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception))
    res.status(500).json({ statusCode: 500, errorCode: 'INTERNAL_ERROR', message: '伺服器發生錯誤', requestId: this.ctx.requestId })
  }
}
