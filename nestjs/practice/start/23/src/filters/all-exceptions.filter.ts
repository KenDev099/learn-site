import { Catch, HttpException, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import type { Request } from 'express'

// 沒有自己帶 errorCode 的 HttpException，依狀態碼補一個
const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const { httpAdapter } = this.adapterHost
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const requestId = req.requestId

    if (exception instanceof HttpException) {
      // 4xx 是客戶端的問題：保留原本的內容（例如 ValidationPipe 的欄位錯誤），只補欄位
      const status = exception.getStatus()
      const response = exception.getResponse()
      const body = typeof response === 'string' ? { statusCode: status, message: response } : { ...response }
      httpAdapter.reply(ctx.getResponse(), {
        ...body,
        errorCode: exception.errorCode ?? (body as { errorCode?: string }).errorCode ?? CODE_BY_STATUS[status] ?? `HTTP_${status}`,
        requestId,
      }, status)
      if (status >= 500) this.logger.error(`[${requestId}] ${req.method} ${req.originalUrl} ${exception.message}`, exception.stack)
      return
    }

    // 其他都是非預期的錯誤（我們的 bug、資料庫錯誤…）：細節只進 log，回應只有固定訊息
    const stack = exception instanceof Error ? exception.stack : String(exception)
    this.logger.error(`[${requestId}] ${req.method} ${req.originalUrl} 未處理的例外`, stack)
    httpAdapter.reply(ctx.getResponse(), {
      statusCode: 500,
      error: 'Internal Server Error',
      message: '伺服器發生錯誤',
      errorCode: 'INTERNAL_ERROR',
      requestId,
    }, 500)
  }
}
