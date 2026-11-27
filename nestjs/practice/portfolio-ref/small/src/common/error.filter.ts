import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'

// 沒有自己帶 errorCode 的 HttpException（Nest 內建的 404、body 太大…）依狀態碼補一個
const CODE_BY_STATUS: Record<number, string> = { 400: 'VALIDATION_FAILED', 404: 'NOT_FOUND', 413: 'PAYLOAD_TOO_LARGE', 503: 'SERVICE_UNAVAILABLE' }

// 所有錯誤都變成同一個格式：{ statusCode, errorCode, message, requestId }（第 2 課）
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors')

  catch(exception: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>()
    const res = host.switchToHttp().getResponse<Response>()
    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse() as { errorCode?: string; message?: string | string[] }
      const message = typeof body === 'string' ? body : [body.message ?? exception.message].flat().join('；')
      res.status(status).json({ statusCode: status, errorCode: body.errorCode ?? CODE_BY_STATUS[status] ?? `HTTP_${status}`, message, requestId: req.requestId })
      return
    }
    // 非預期的錯誤：細節只進 log，回應不帶 stack 與資料庫訊息
    this.logger.error(`requestId=${req.requestId}`, exception instanceof Error ? exception.stack : String(exception))
    res.status(500).json({ statusCode: 500, errorCode: 'INTERNAL_ERROR', message: '伺服器發生錯誤', requestId: req.requestId })
  }
}
