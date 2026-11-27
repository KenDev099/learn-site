import { ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

// main.ts 和測試共用的全域設定（第 10 課）
export function configureApp(app: INestApplication) {
  // 所有 API 都在 /api/v1/… 底下；健康檢查留在 /health/…，給平台的探針用
  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] })
  app.enableVersioning({ type: VersioningType.URI })

  // 沒宣告在 DTO 的欄位直接 400：擋下 { "stock": 999 } 這種多送的欄位（mass assignment），前端也馬上知道送錯
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))

  // 第 23 課：/docs 是 Swagger UI，/docs-json 是 OpenAPI 文件
  const config = new DocumentBuilder().setTitle('咖啡店訂單 API').setVersion('1.0').build()
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, config))
}
