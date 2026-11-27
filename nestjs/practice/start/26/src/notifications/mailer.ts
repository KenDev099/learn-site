import { Injectable } from '@nestjs/common'

export type Mail = { customerId: number; subject: string; text: string }

// 練習用的假寄信：只記在記憶體（sent），不會真的寄出
@Injectable()
export class Mailer {
  readonly sent: Mail[] = []

  async send(mail: Mail) {
    this.sent.push(mail)
  }
}
