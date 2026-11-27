import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { CustomersController } from './customers/customers.controller.js'
import { CustomersService } from './customers/customers.service.js'
import { DeliveryClient } from './delivery/delivery.client.js'
import { DeliveryController } from './delivery/delivery.controller.js'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { MenuController } from './menu/menu.controller.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { ReportsController } from './reports/reports.controller.js'
import { ReportsService } from './reports/reports.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

// 練習 1–3：用 APP_INTERCEPTOR 登記 interceptor（想想登記的順序）
@Module({
  controllers: [MenuController, ProductsController, OrdersController, CustomersController, DeliveryController, ReportsController],
  providers: [
    ProductsService,
    OrdersService,
    CustomersService,
    DeliveryClient,
    ReportsService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorFormat: 'grouped' }),
    },
    // 第 8 課：全域 filter 由後往前比對，catch-all 放前面，專門的放後面
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
