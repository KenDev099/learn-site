import { Module } from '@nestjs/common'
import { OrdersController } from './orders/orders.controller.js'
import { OrdersService } from './orders/orders.service.js'
import { ProductsController } from './products/products.controller.js'
import { ProductsService } from './products/products.service.js'
import { StampCardsController } from './stamp-cards/stamp-cards.controller.js'

// 練習 1：在 providers 用 APP_PIPE 登記全域的 ValidationPipe
// 練習 4：再登記一個 StandardSchemaValidationPipe（兩個並存）
@Module({
  controllers: [OrdersController, ProductsController, StampCardsController],
  providers: [OrdersService, ProductsService],
})
export class AppModule {}
