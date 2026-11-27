import { Injectable, Logger } from '@nestjs/common'

export type Mail = { to: string; subject: string; text: string }

// 練習用的寄信服務：不真的寄出，只記在 sent 並印到 log。正式環境換成寄信服務商的 SDK
@Injectable()
export class Mailer {
  readonly sent: Mail[] = []
  private readonly logger = new Logger(Mailer.name)

  async send(mail: Mail) {
    this.sent.push(mail)
    this.logger.log(`寄信給 ${mail.to}：${mail.subject}`)
  }
}
