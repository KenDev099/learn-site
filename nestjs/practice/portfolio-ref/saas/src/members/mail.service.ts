import { Injectable, type OnApplicationShutdown } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport, type Transporter } from 'nodemailer'
import type { Env } from '../config/env.js'

// 開發與測試寄到 Mailpit（compose 的 mailpit，SMTP 1027）；正式環境 SMTP_URL 換成寄信服務商
@Injectable()
export class MailService implements OnApplicationShutdown {
  private readonly transport: Transporter
  private readonly from: string

  constructor(config: ConfigService<Env, true>) {
    this.transport = createTransport(config.get('SMTP_URL', { infer: true }))
    this.from = config.get('MAIL_FROM', { infer: true })
  }

  async send(to: string, subject: string, text: string) {
    await this.transport.sendMail({ from: this.from, to, subject, text })
  }

  onApplicationShutdown() {
    this.transport.close()
  }
}
