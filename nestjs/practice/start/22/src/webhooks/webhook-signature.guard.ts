import { Injectable, type CanActivate, type ExecutionContext, type RawBodyRequest } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { Env } from '../config/env.schema.js'

// 驗證 X-Signature: t=<Unix 秒數>,v1=<HMAC-SHA256 的 hex>
// 簽的內容是 `${t}.${原始 body}`，密鑰是 PAYMENT_WEBHOOK_SECRET
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  // 練習 2：通過回傳 true；簽章不對、格式不對、時間差超過 300 秒都丟 UnauthorizedException
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>()
    throw new Error(`還沒寫：WebhookSignatureGuard（收到的標頭：${req.header('x-signature')}）`)
  }
}
