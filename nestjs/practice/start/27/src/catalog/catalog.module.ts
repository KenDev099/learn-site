import { Module } from '@nestjs/common'
import { AdminGuard } from './admin.guard.js'
import { MenuController } from './menu.controller.js'
import { MenuService } from './menu.service.js'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'

@Module({
  controllers: [MenuController, ProductsController],
  providers: [MenuService, ProductsService, AdminGuard],
})
export class CatalogModule {}
