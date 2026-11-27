import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller.js'
import { ProductsService } from './products.service.js'
import { PricingService } from './pricing.service.js'
import { CLOCK, type Clock } from './clock.js'
import { FakePaymentGateway, LinePayGateway } from './payment-gateway.js'
import { CheckoutService } from './checkout.service.js'

@Module({
  controllers: [ProductsController],
  providers: [
    ProductsService,
    PricingService,
    { provide: CLOCK, useValue: { now: () => new Date() } satisfies Clock },
    {
      provide: 'PaymentGateway',
      useFactory: () => {
        const provider = process.env.PAYMENT_PROVIDER ?? 'fake'   // 第 11 課改用 ConfigService
        if (provider === 'fake') return new FakePaymentGateway()
        if (provider === 'linepay') return new LinePayGateway()
        throw new Error(`PAYMENT_PROVIDER 只能是 fake 或 linepay，收到 "${provider}"`)
      },
    },
    CheckoutService,
  ],
})
export class AppModule {}
