import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Request, Response } from 'express'
import { STATUS_CODES } from 'node:http'
import { DomainError } from '../errors/domain-errors.js'

// errorCode → HTTP 狀態碼。沒列到的是「違反業務規則」→ 422（例如 IDEMPOTENCY_KEY_REUSED）
const STATUS_BY_CODE: Record<string, number> = {
  PRODUCT_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  OUT_OF_STOCK: 409,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_IN_PROGRESS: 409,
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
