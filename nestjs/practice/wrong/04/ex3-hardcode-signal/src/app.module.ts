import { Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common'
import { lifecycleLog } from './lifecycle-log.js'
import { MenuModule } from './menu/menu.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { ProductsModule } from './products/products.module.js'

// 錯：signal 寫死成 SIGTERM，沒有用參數
@Module({
  imports: [MenuModule, ProductsModule, OrdersModule],
})
export class AppModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('AppModule')

  onModuleInit() {
    lifecycleLog.push('AppModule.onModuleInit')
  }

  onApplicationShutdown() {
    this.logger.log(`收到 SIGTERM，應用程式關閉`)
    lifecycleLog.push(`AppModule.onApplicationShutdown:SIGTERM`)
  }
}
