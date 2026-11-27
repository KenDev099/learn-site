import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { CatalogModule } from './catalog/catalog.module.js'
import { PricingService } from './catalog/pricing.service.js'
import { LoyaltyModule } from './loyalty/loyalty.module.js'
import { Mailer } from './notifications/mailer.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { OrdersRepository } from './orders/orders.repository.js'
import { envSchema } from './config/env.schema.js'
import { PrismaModule } from './prisma/prisma.module.js'

// 「大家都會用到的先放這裡」：一個什麼都放的全域模組（練習 3 要拆掉它）
@Global()
@Module({
  providers: [Mailer, PricingService, OrdersRepository],
  exports: [Mailer, PricingService, OrdersRepository],
})
export class SharedModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    SharedModule,
    CatalogModule,
    OrdersModule,
    LoyaltyModule,
    NotificationsModule,
  ],
})
export class AppModule {}
