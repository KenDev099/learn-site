import { Module, StandardSchemaValidationPipe } from '@nestjs/common'
import { APP_PIPE } from '@nestjs/core'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { StampCardsController } from './stamp-cards/stamp-cards.controller.js'

@Module({
  controllers: [OrdersController, ProductsController, StampCardsController],
  providers: [
    OrdersService,
    ProductsService,
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
  ],
})
export class AppModule {}
