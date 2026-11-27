import { Inject, Injectable } from '@nestjs/common'
import { MODULE_OPTIONS_TOKEN, type PaymentModuleOptions } from './payment.module-definition.js'

@Injectable()
export class PaymentClient {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) readonly options: PaymentModuleOptions) {}

  // 只說明連到哪裡、有沒有金鑰，不把金鑰本身寫進 log
  describe() {
    return `金流 ${this.options.baseUrl}（${this.options.apiKey ? '有' : '沒有'} API 金鑰）`
  }
}
