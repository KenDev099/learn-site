import { Module } from '@nestjs/common'
import { PaymentClient } from './payment.client.js'
import { ConfigurableModuleClass } from './payment.module-definition.js'

@Module({
  providers: [PaymentClient],
  exports: [PaymentClient],
})
export class PaymentModule extends ConfigurableModuleClass {}
