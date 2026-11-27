import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'
import { OrdersModule } from './orders/orders.module.js'
import { ProductsModule } from './products/products.module.js'
import { ReportsModule } from './reports/reports.module.js'
import { StampsModule } from './stamps/stamps.module.js'
import { StoreModule } from './store/store.module.js'

@Module({
  imports: [StoreModule, ProductsModule, OrdersModule, StampsModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
