import { ParseUUIDPipe } from '@nestjs/common'
import { notFound } from './api-error.js'

// 路徑上的 id 不是 UUID：當成「不存在」回 404，不要讓壞掉的 id 跑到資料庫變成 500
export const UUID = new ParseUUIDPipe({ exceptionFactory: () => notFound() })
