import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { STATUS_CODES } from 'node:http'
import { DomainError } from '../errors/domain-errors.js'

const STATUS_BY_CODE: Record<string, number> = {
  OUT_OF_STOCK: 409,
  PRODUCT_NOT_FOUND: 404,
}

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const status = STATUS_BY_CODE[exception.code] ?? 422
    res.status(status).json({
      statusCode: status,
      error: STATUS_CODES[status],
      message: exception.message,
      errorCode: exception.code,
      details: exception.details,
    })
  }
}
