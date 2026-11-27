import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ApiError } from './common/api-error.js'
import { ErrorFilter } from './common/error.filter.js'
import { requestId } from './common/request-id.js'

// main.ts 與 E2E 測試共用的全域設定：漏了一行，測試就會測到另一套設定（第 3 課）
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] })
  app.use(requestId)
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,              // 去掉 DTO 沒宣告的欄位
    forbidNonWhitelisted: true,   // 有多餘欄位就 400，而不是默默忽略
    transform: true,
    exceptionFactory: errors => new ApiError(400, 'VALIDATION_FAILED',
      errors.flatMap(e => Object.values(e.constraints ?? {})).join('；') || '輸入不正確'),
  }))
  app.useGlobalFilters(new ErrorFilter())
}
