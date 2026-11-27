import { Module, ValidationPipe, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { MenuController } from './menu/menu.controller.js'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsService } from './products/products.service.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

@Module({
  controllers: [MenuController, OrdersController],
  providers: [
    OrdersService,
    ProductsService,
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorFormat: 'grouped' }),
    },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
