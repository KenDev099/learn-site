import { Injectable, Logger } from '@nestjs/common'

// 永久性錯誤：收件地址本身就是錯的，再寄幾次結果都一樣
export class InvalidRecipientError extends Error {
  constructor(readonly to: string) {
    super(`收件地址格式錯誤：${to}`)
    this.name = 'InvalidRecipientError'
  }
}

// 模擬外部的寄信服務（正式環境會呼叫寄信服務的 API，可能很慢、可能暫時失敗）。不用改這個檔案
@Injectable()
export class Mailer {
  private readonly logger = new Logger(Mailer.name)

  async sendReceipt(to: string, orderId: number) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new InvalidRecipientError(to)
    await new Promise(r => setTimeout(r, 300))
    this.logger.log(`已寄出訂單 ${orderId} 的收據給 ${to}`)
  }
}
