import { Module } from '@nestjs/common'
import { MenuModule } from '../menu/menu.module.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  imports: [MenuModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
