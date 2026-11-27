import { Module } from '@nestjs/common'
import { PaymentsModule } from '../payments/payments.module.js'
import { OrdersController } from './orders.controller.js'
import { OrdersService } from './orders.service.js'

// PaymentsModule：退款用的 CafePayV2Client（CAFE-50）
@Module({ imports: [PaymentsModule], controllers: [OrdersController], providers: [OrdersService] })
export class OrdersModule {}
