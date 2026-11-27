import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { DomainExceptionFilter } from './filters/domain-exception.filter.js'
import { OrdersModule } from './orders/orders.module.js'
import { PaymentModule } from './payment/payment.module.js'

// 練習 1：imports 加上 ConfigModule.forRoot，用 env.schema.ts 的 envSchema 在啟動時驗證
// 練習 3：PaymentModule 改用 registerAsync，從設定取 apiKey 與 baseUrl
@Module({
  imports: [
    OrdersModule,
    PaymentModule.register({ apiKey: 'dev-key', baseUrl: 'https://sandbox.pay.example.test' }),
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
