import { Module } from '@nestjs/common'
import { ReceiptsModule } from '../receipts/receipts.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'
import { PaymentGateway } from './payment.gateway.js'

@Module({
  imports: [ReceiptsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PaymentGateway],
})
export class OrdersModule {}
