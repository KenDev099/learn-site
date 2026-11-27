import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

@Module({
  controllers: [OrdersController, ProductsController],
  providers: [
    OrdersService,
    ProductsService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorFormat: 'grouped' }),
    },
    // 全域 filter 由後往前比對，先比對到的那一個處理：catch-all 放前面，專門的放後面
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
