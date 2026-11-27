import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { ApiError } from './common/api-error.js'
import { RequestContext } from './common/request-context.js'
import { RequestIdMiddleware } from './common/request-id.middleware.js'
import type { Env } from './config/env.js'
import { AuthModule } from './auth/auth.module.js'
import { ProjectsModule } from './projects/projects.module.js'

// main.ts 與測試共用的全域設定
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService)
  const express = app as NestExpressApplication
  express.set('trust proxy', 'loopback')
  const requestId = new RequestIdMiddleware(app.get(RequestContext))
  app.use(requestId.use.bind(requestId))            // 在 body parser 之前：壞掉的 JSON 回 400 時也有 x-request-id（第 16 課）
  app.use(helmet())                                 // 也在 body parser 之前：被 body parser 拒絕的回應一樣有安全標頭
  express.useBodyParser('json', { limit: '1mb' })   // 超過回 413（第 18 課）
  app.use(cookieParser())
  // CORS 只允許設定裡列出的前端網址；不要用 origin: true（把請求的 Origin 原樣回傳＝誰都可以，第 18 課）
  app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }), credentials: true })
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] })
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    exceptionFactory: errors => new ApiError(400, 'VALIDATION_FAILED',
      errors.flatMap(e => [...Object.values(e.constraints ?? {}), ...(e.children?.length ? [`${e.property} 格式不正確`] : [])]).join('；') || '輸入不正確'),
  }))

  // 文件先只放前端要用的模組
  // OpenAPI（第 15 課）：/openapi.json 給前端產生型別，/docs 是 Swagger UI
  const doc = new DocumentBuilder().setTitle('My SaaS API').setVersion('1.0')
    .addBearerAuth().addCookieAuth('refresh_token', { type: 'apiKey' }, 'refresh_token').build()   // 第三個參數是 @ApiCookieAuth 引用的名稱
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc, { include: [AuthModule, ProjectsModule] }), { jsonDocumentUrl: 'openapi.json' })
}
