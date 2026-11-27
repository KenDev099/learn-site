import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext, type RawBodyRequest } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { Env } from '../config/env.schema.js'

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

    const secret = this.config.get('PAYMENT_WEBHOOK_SECRET', { infer: true })
    const expected = createHmac('sha256', secret).update(`${t}.`).update(req.rawBody).digest()
    const given = Buffer.from(v1, 'hex')
    // timingSafeEqual 遇到長度不同會丟 RangeError，先比長度
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('簽章不符')
    return true
  }
}
