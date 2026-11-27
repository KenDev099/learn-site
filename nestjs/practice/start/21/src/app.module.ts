import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { envSchema } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { KitchenModule } from './kitchen/kitchen.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ReconciliationModule } from './reconciliation/reconciliation.module.js'
import { StampCardsModule } from './stamp-cards/stamp-cards.module.js'
import { StatsModule } from './stats/stats.module.js'

// 練習 1 加上 ScheduleModule.forRoot()；練習 4 加上 EventEmitterModule.forRoot()。整個應用程式各只能有一次
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    OrdersModule,
    StampCardsModule,
    ReconciliationModule,
    KitchenModule,
    StatsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
