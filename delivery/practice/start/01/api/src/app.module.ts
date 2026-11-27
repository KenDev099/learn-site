import { Controller, Get, Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { PrismaModule } from './common/prisma.service.js'
import { RequestLogMiddleware } from './common/request-log.middleware.js'
import { OrdersModule } from './orders/orders.module.js'
import { ProductsModule } from './products/products.module.js'

@Controller()
class HealthController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
  imports: [PrismaModule, ProductsModule, OrdersModule],
  controllers: [HealthController],
  providers: [
    // 驗證失敗回 422（不是預設的 400）；whitelist：DTO 沒宣告的欄位直接丟掉
    { provide: APP_PIPE, useValue: new ValidationPipe({ whitelist: true, transform: true, errorHttpStatusCode: 422 }) },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLogMiddleware).forRoutes('*path')
  }
}
