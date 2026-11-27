import { Controller, Get, Module, StandardSchemaValidationPipe, UnprocessableEntityException, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { AuthModule } from './auth/auth.module.js'
import { ClockModule } from './common/clock.js'
import { FeatureFlagsModule } from './common/feature-flags.js'
import { PrismaModule } from './common/prisma.service.js'
import { RequestLogMiddleware } from './common/request-log.middleware.js'
import { KitchenModule } from './kitchen/kitchen.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { PaymentsModule } from './payments/payments.module.js'
import { PickupModule } from './pickup/pickup.module.js'
import { ProductsModule } from './products/products.module.js'

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
  imports: [PrismaModule, ClockModule, FeatureFlagsModule, AuthModule, ProductsModule, OrdersModule, KitchenModule, PickupModule, PaymentsModule],
  controllers: [HealthController],
  providers: [
    // 驗證失敗回 422（不是預設的 400）；whitelist：DTO 沒宣告的欄位直接丟掉
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true, errorHttpStatusCode: 422 }) },
    // 用 zod 契約驗證：參數寫成 @Body({ schema: 某個 zod schema }) 才會檢查，沒寫 schema 的參數直接放行
    // 驗證失敗回 422，body 是契約的錯誤格式 { code, message }；message 列出哪個欄位錯了
    {
      provide: APP_PIPE,
      useValue: new StandardSchemaValidationPipe({
        exceptionFactory: issues => new UnprocessableEntityException({
          code: 'VALIDATION_FAILED',
          message: issues.map(i => `${(i.path ?? []).map(p => String(typeof p === 'object' ? p.key : p)).join('.')}: ${i.message}`).join('；'),
        }),
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // 登入的 cookie 用 SESSION_SECRET 驗證簽章（v2.8.0）；沒設定就不要啟動，免得簽章用的是空字串
    const secret = process.env.SESSION_SECRET
    if (!secret) throw new Error('SESSION_SECRET 沒有設定：把 api/.env.example 的 SESSION_SECRET 複製到 api/.env')
    consumer.apply(cookieParser(secret), RequestLogMiddleware).forRoutes('*path')
  }
}
