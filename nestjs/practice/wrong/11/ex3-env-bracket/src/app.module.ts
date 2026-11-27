import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { envSchema, type Env } from './config/env.schema.js'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { PaymentModule } from './payment/payment.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    OrdersModule,
    PaymentModule.register({ apiKey: process['env'].PAYMENT_API_KEY, baseUrl: process['env'].PAYMENT_BASE_URL ?? 'https://sandbox.pay.example.test' }),
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
