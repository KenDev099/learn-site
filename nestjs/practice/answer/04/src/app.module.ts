import { Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { lifecycleLog } from './lifecycle-log.js'
import { MenuModule } from './menu/menu.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { ProductsModule } from './products/products.module.js'

@Module({
  imports: [MenuModule, ProductsModule, OrdersModule],
})
export class AppModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('AppModule')

  onModuleInit() {
    lifecycleLog.push('AppModule.onModuleInit')
  }

  onApplicationShutdown(signal?: string) {
    this.logger.log(`收到 ${signal}，應用程式關閉`)
    lifecycleLog.push(`AppModule.onApplicationShutdown:${signal}`)
  }
}
