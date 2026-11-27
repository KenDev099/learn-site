import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { STATUS_CODES } from 'node:http'
import { Prisma } from '../generated/prisma/client.js'

// service 沒有自己處理的 Prisma 錯誤，在這裡統一轉成 HTTP 錯誤。訊息是固定的：Prisma 的原文有資料表與欄位名稱
const KNOWN: Record<string, { status: number; errorCode: string; message: string }> = {
  P2002: { status: 409, errorCode: 'UNIQUE_VIOLATION', message: '資料重複' },
  P2003: { status: 409, errorCode: 'FOREIGN_KEY_VIOLATION', message: '關聯的資料不存在，或還有其他資料參照它' },
  P2025: { status: 404, errorCode: 'NOT_FOUND', message: '找不到資料' },
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name)

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()
    const known = KNOWN[exception.code]
    if (!known) this.logger.error(`未處理的 Prisma 錯誤 ${exception.code}`, exception.stack)
    const { status, errorCode, message } = known ?? { status: 500, errorCode: 'INTERNAL_ERROR', message: '伺服器發生錯誤' }
    res.status(status).json({ statusCode: status, error: STATUS_CODES[status], message: exception.message, errorCode })
  }
}
