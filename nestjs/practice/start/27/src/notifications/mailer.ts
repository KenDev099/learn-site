import { Injectable } from '@nestjs/common'

export type Mail = { customerId: number; subject: string; text: string; idempotencyKey: string }

// 練習用的假寄信服務：只記在記憶體（sent），不會真的寄出。不用改這個檔案
// 跟很多外部 API 一樣接受 idempotencyKey：同一個 key 只寄一次（重試的工作不會寄出第二封）
@Injectable()
export class Mailer {
  readonly sent: Mail[] = []

  async send(mail: Mail) {
    if (this.sent.some(m => m.idempotencyKey === mail.idempotencyKey)) return
    this.sent.push(mail)
  }
}
