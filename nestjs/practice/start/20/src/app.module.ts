import { BullModule } from '@nestjs/bullmq'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { envSchema, type Env } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { OutboxModule } from './outbox/outbox.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ReceiptsModule } from './receipts/receipts.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // 所有佇列共用的 Redis 連線設定；prefix 是這個應用程式在 Redis 裡所有 key 的開頭
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: config.get('REDIS_PREFIX', { infer: true }),
      }),
    }),
    PrismaModule,
    ReceiptsModule,
    OrdersModule,
    OutboxModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
