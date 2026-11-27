import { Injectable, Logger } from '@nestjs/common'
import { setTimeout } from 'node:timers/promises'

// 模擬外部的寄信服務：每封要 1 秒。不用改這個檔案
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name)

  async sendReceipt(to: string, orderId: number) {
    await setTimeout(1000)
    // email 是個資：log 只記訂單編號
    this.logger.log('收據已寄出', { orderId })
    return { to }
  }
}
