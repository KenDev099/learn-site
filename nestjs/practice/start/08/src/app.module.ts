import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

// 練習 1–3：用 APP_FILTER 登記 DomainExceptionFilter 與 AllExceptionsFilter（注意順序）
@Module({
  controllers: [OrdersController, ProductsController],
  providers: [
    OrdersService,
    ProductsService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorFormat: 'grouped' }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')   // 第 6 課：每個請求都有 req.requestId 和 X-Request-Id 標頭
  }
}
