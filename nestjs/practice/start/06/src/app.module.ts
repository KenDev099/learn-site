import { Module } from '@nestjs/common'
import { MenuController } from './menu.controller.js'
import { OrdersController } from './orders.controller.js'
import { ProductsController } from './products.controller.js'
import { WhoamiController } from './whoami.controller.js'

// 練習 1：讓 AppModule 實作 NestModule，在 configure() 套用 RequestIdMiddleware
// 練習 2：在 providers 用 APP_GUARD 註冊 AdminKeyGuard
// 練習 3：imports 加上 ThrottlerModule，providers 用 APP_GUARD 註冊 ThrottlerGuard
@Module({
  controllers: [MenuController, OrdersController, ProductsController, WhoamiController],
})
export class AppModule {}
