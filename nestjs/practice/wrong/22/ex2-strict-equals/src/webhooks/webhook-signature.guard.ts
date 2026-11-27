import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext, type RawBodyRequest } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { createHmac } from 'node:crypto'
import type { Env } from '../config/env.schema.js'

const TOLERANCE_SECONDS = 300

// 驗證 X-Signature: t=<Unix 秒數>,v1=<HMAC-SHA256 的 hex>
// 簽的內容是 `${t}.${原始 body}`，密鑰是 PAYMENT_WEBHOOK_SECRET
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest<Request>>()
    const parts = new URLSearchParams((req.header('x-signature') ?? '').replaceAll(',', '&'))
    const t = parts.get('t') ?? ''
    const v1 = parts.get('v1') ?? ''
    if (!/^\d+$/.test(t) || !req.rawBody) throw new UnauthorizedException('簽章格式錯誤')
    if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_SECONDS) throw new UnauthorizedException('簽章已過期')

    const secret = this.config.get('PAYMENT_WEBHOOK_SECRET', { infer: true })
    const expected = createHmac('sha256', secret).update(`${t}.`).update(req.rawBody).digest()
    if (v1 !== expected.toString('hex')) throw new UnauthorizedException('簽章不符')
    return true
  }
}
