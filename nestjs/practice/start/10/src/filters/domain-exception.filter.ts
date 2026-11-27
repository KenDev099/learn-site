import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { STATUS_CODES } from 'node:http'
import { DomainError } from '../errors/domain-errors.js'

// errorCode → HTTP 狀態碼。新增領域錯誤時在這裡加一行；沒列到的是「違反業務規則」→ 422
const STATUS_BY_CODE: Record<string, number> = {
  OUT_OF_STOCK: 409,
  PRODUCT_NOT_FOUND: 404,
  PAYMENT_FAILED: 502,   // 上游（金流）出錯：502 Bad Gateway
}

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const req = ctx.getRequest<Request>()
    const res = ctx.getResponse<Response>()
    const status = STATUS_BY_CODE[exception.code] ?? 422
    res.status(status).json({
      statusCode: status,
      error: STATUS_CODES[status],
      message: exception.message,
      errorCode: exception.code,
      details: exception.details,
      requestId: req.requestId,
    })
  }
}
