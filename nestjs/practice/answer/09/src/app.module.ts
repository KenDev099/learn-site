import { Module, StandardSchemaSerializerInterceptor, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core'
import { CustomersController } from './customers/customers.controller.js'
import { CustomersService } from './customers/customers.service.js'
import { DeliveryClient } from './delivery/delivery.client.js'
import { DeliveryController } from './delivery/delivery.controller.js'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { TimeoutInterceptor } from './interceptors/timeout.interceptor.js'
import { TimingInterceptor } from './interceptors/timing.interceptor.js'
import { MenuController } from './menu/menu.controller.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { ReportsController } from './reports/reports.controller.js'
import { ReportsService } from './reports/reports.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

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
    // 全域 interceptor 依登記順序由外往內包：計時在最外層，才量得到逾時與序列化花的時間、錯誤回應也有標頭
    { provide: APP_INTERCEPTOR, useClass: TimingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
