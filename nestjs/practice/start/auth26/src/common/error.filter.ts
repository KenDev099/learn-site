import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { Prisma } from '../generated/prisma/client.js'

// 把 Prisma 的錯誤轉成 HTTP 回應，方便前台除錯
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientUnknownRequestError)
export class ErrorFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientUnknownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const status = 'code' in exception && exception.code === 'P2002' ? 409 : 500
    res.status(status).json({ statusCode: status, message: exception.message, stack: exception.stack })
  }
}
