import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { RequestContext } from './request-context.js'

// Nest 內建的例外（路由不存在、body 太大、限流…）沒有 errorCode：依狀態碼補一個
const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_FAILED', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  413: 'PAYLOAD_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 429: 'RATE_LIMITED', 503: 'SERVICE_UNAVAILABLE',
}

// 每個錯誤回應都是 { statusCode, errorCode, message, requestId }；500 一律 INTERNAL_ERROR，細節只進 log（第 16 課）
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors')

  constructor(private readonly ctx: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const requestId = host.switchToHttp().getRequest().headers['x-request-id']   // 前端送來的那個
    if (exception instanceof HttpException && exception.getStatus() < 500) {
      const status = exception.getStatus()
      const body = exception.getResponse() as string | { errorCode?: string; message?: string | string[] }
      const message = typeof body === 'string' ? body : [body.message ?? exception.message].flat().join('；')
      const errorCode = (typeof body === 'object' && body.errorCode) || CODE_BY_STATUS[status] || `HTTP_${status}`
      res.status(status).json({ statusCode: status, errorCode, message, requestId })
      return
    }
    if (exception instanceof HttpException && exception.getStatus() === 503) {
      res.status(503).json({ statusCode: 503, errorCode: 'SERVICE_UNAVAILABLE', message: '服務暫時無法使用', requestId })
      return
    }
    this.logger.error(exception instanceof Error ? exception.stack ?? exception.message : String(exception))
    res.status(500).json({ statusCode: 500, errorCode: 'INTERNAL_ERROR', message: '伺服器發生錯誤', requestId })
  }
}
