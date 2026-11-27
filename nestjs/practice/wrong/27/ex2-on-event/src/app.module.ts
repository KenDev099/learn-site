import { createKeyv } from '@keyv/redis'
import { BullModule } from '@nestjs/bullmq'
import { CacheModule } from '@nestjs/cache-manager'
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_FILTER } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { CatalogModule } from './catalog/catalog.module.js'
import { envSchema, type Env } from './config/env.schema.js'
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { HealthModule } from './health/health.module.js'
import { LoggingModule } from './logging/logging.module.js'
import { LoyaltyModule } from './loyalty/loyalty.module.js'
import { NotificationsModule } from './notifications/notifications.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { OutboxModule } from './outbox/outbox.module.js'
import { PaymentsModule } from './payments/payments.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { RedisModule } from './redis/redis.module.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    // 佇列（第 20 課）與快取（第 19 課）都放在 Redis，key 的開頭都是 REDIS_PREFIX
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: config.get('REDIS_PREFIX', { infer: true }),
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        stores: [createKeyv(config.get('REDIS_URL', { infer: true }), {
          namespace: config.get('REDIS_PREFIX', { infer: true }),
          connectionTimeout: 1_000,
        })],
      }),
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    LoggingModule,
    PrismaModule,
    RedisModule,
    HealthModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    OutboxModule,
    LoyaltyModule,
    NotificationsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('{*path}')
  }
}
