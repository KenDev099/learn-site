import { forwardRef, Module } from '@nestjs/common'
import { ProductsModule } from '../products/products.module.js'
import { StampsModule } from '../stamps/stamps.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

@Module({
  imports: [ProductsModule, forwardRef(() => StampsModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
