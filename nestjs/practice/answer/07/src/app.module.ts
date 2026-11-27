import { Module, StandardSchemaValidationPipe, ValidationPipe } from '@nestjs/common'
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
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,              // 刪掉沒有規則的欄位
        forbidNonWhitelisted: true,   // 改成直接 400
        transform: true,              // 變成 DTO 的實例，並依 @Type 轉換
        errorFormat: 'grouped',       // 錯誤依欄位路徑分組
      }),
    },
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
  ],
})
export class AppModule {}
