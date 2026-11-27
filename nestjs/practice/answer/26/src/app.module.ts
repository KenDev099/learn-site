import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { CatalogModule } from './catalog/catalog.module.js'
import { LoyaltyModule } from './loyalty/loyalty.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { envSchema } from './config/env.schema.js'
import { PrismaModule } from './prisma/prisma.module.js'

// 全域的只有基礎設施：設定（isGlobal）、Prisma（@Global）。業務模組各自用 imports／exports 寫出依賴
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    CatalogModule,
    OrdersModule,
    LoyaltyModule,
    NotificationsModule,
  ],
})
export class AppModule {}
