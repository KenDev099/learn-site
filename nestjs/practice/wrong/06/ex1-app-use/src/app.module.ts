import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AdminKeyGuard } from './admin-key.guard.js'
import { MenuController } from './menu.controller.js'
import { OrdersController } from './orders.controller.js'
import { ProductsController } from './products.controller.js'
import { RequestIdMiddleware } from './request-id.middleware.js'
import { WhoamiController } from './whoami.controller.js'

@Module({
  imports: [
    // 一般路由：每個客戶端、每條路由 60 秒 20 次（ttl 是毫秒）
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 20 }] }),
  ],
  controllers: [MenuController, OrdersController, ProductsController, WhoamiController],
  providers: [
    // 全域 guard 照登記順序執行：限流放前面，猜金鑰的請求也會被計數
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AdminKeyGuard },
    AdminKeyGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    void consumer
  }
}
