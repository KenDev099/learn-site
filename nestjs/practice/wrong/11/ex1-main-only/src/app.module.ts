import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import type { Env } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { PaymentModule } from './payment/payment.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    OrdersModule,
    PaymentModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        apiKey: config.get('PAYMENT_API_KEY', { infer: true }),
        baseUrl: config.get('PAYMENT_BASE_URL', { infer: true }),
      }),
    }),
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
