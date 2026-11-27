import { Module } from '@nestjs/common'
import { StoreModule } from '../store/store.module.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  imports: [StoreModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
