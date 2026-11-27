import { Module } from '@nestjs/common'
import { StampsController } from './stamps.controller.js'
import { StampsService } from '../orders/orders.service.js'

@Module({
  controllers: [StampsController],
  providers: [StampsService],
  exports: [StampsService],
})
export class StampsModule {}
