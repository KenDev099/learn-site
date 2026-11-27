import { Module } from '@nestjs/common'
import { ConfigurableModuleClass } from './receipt.module-definition.js'
import { ReceiptService } from './receipt.service.js'

@Module({
  providers: [ReceiptService],
  exports: [ReceiptService],
})
export class ReceiptModule extends ConfigurableModuleClass {}
