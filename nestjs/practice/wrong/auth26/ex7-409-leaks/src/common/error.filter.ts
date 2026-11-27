import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'
import { randomUUID } from 'node:crypto'
import { Prisma } from '../generated/prisma/client.js'

// 所有錯誤都經過這裡：預期內的照常回應，其他的只給 requestId，細節只寫進 log
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors')

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    if (exception instanceof HttpException) {
      const body = exception.getResponse()
      res.status(exception.getStatus()).json(typeof body === 'string' ? { statusCode: exception.getStatus(), message: body } : body)
      return
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      res.status(409).json({ statusCode: 409, message: exception.message })   // 自己的訊息，不轉傳 Prisma 的
      return
    }
    const requestId = randomUUID()
    this.logger.error(`requestId=${requestId}`, exception instanceof Error ? exception.stack : String(exception))
    res.status(500).json({ statusCode: 500, message: '伺服器發生錯誤', requestId })
  }
}
