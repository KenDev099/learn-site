import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { CLOCK } from './clock.js'
import { CouponsController } from './coupons/coupons.controller.js'
import { CouponsService } from './coupons/coupons.service.js'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { PaymentGateway } from './payments/payment.gateway.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

@Module({
  controllers: [OrdersController, ProductsController, CouponsController],
  providers: [
    OrdersService,
    ProductsService,
    PaymentGateway,
    CouponsService,
    { provide: CLOCK, useValue: { now: () => new Date() } },
    // 能放進模組的全域設定放在這裡：測試用 AppModule 建 app 時自動帶上（第 7、8 課）
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorFormat: 'grouped' }),
    },
    // 全域 filter 由後往前比對，先比對到的那一個處理：catch-all 放前面，專門的放後面
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')   // 第 6 課：每個請求都有 req.requestId 和 X-Request-Id 標頭
  }
}
