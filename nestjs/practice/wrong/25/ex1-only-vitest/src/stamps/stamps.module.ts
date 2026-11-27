import { forwardRef, Module } from '@nestjs/common'
import { OrdersModule } from '../orders/orders.module.js'
import { StampsController } from './stamps.controller.js'
import { StampsService } from './stamps.service.js'

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [StampsController],
  providers: [StampsService],
  exports: [StampsService],
})
export class StampsModule {}
