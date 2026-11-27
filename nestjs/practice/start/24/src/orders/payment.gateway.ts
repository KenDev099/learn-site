import { Injectable } from '@nestjs/common'
import { setTimeout } from 'node:timers/promises'

// 模擬外部的付款服務：每次扣款要 1 秒。不用改這個檔案
@Injectable()
export class PaymentGateway {
  async charge(orderId: number, amount: number) {
    await setTimeout(1000)
    return { chargeId: `ch_${orderId}_${amount}` }
  }
}
