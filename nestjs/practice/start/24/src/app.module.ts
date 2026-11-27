import { BullModule } from '@nestjs/bullmq'
import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { envSchema, type Env } from './config/env.schema.js'
import { HealthModule } from './health/health.module.js'
import { LoggingModule } from './logging/logging.module.js'
import { OrdersModule } from './orders/orders.module.js'
import { PrismaModule } from './prisma/prisma.module.js'
import { ReceiptsModule } from './receipts/receipts.module.js'
import { RedisModule } from './redis/redis.module.js'
import { RequestIdMiddleware } from './request-id.middleware.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: { url: config.get('REDIS_URL', { infer: true }) },
        prefix: config.get('REDIS_PREFIX', { infer: true }),
      }),
    }),
    LoggingModule,
    PrismaModule,
    RedisModule,
    ReceiptsModule,
    OrdersModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*')
  }
}
