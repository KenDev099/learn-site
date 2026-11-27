import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'

// 練習 1：把 service 沒處理的 Prisma 錯誤轉成一致的 HTTP 錯誤
//   P2002 → 409 UNIQUE_VIOLATION、P2003 → 409 FOREIGN_KEY_VIOLATION、P2025 → 404 NOT_FOUND
//   其他代碼 → 500 INTERNAL_ERROR，並用 Logger 記錄原本的錯誤
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {}
}
