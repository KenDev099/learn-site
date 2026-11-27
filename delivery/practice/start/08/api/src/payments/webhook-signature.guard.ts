import { createHmac, timingSafeEqual } from 'node:crypto'
import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import { Clock } from '../common/clock.js'

// 驗證 webhook 真的是 CafePay 送的（NestJS 課第 22 課的做法）：
// CafePay-Signature: t=<Unix 秒數>,v1=<HMAC-SHA256(`${t}.` + 原始 body)>，密鑰是 CAFEPAY_WEBHOOK_SECRET
// 算在原始的位元組上，所以 main.ts 要開 rawBody: true；只接受 300 秒內的簽章，擋下錄下來重送的請求
const TOLERANCE_SECONDS = 300

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly clock: Clock) {}

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>()
    const secret = process.env.CAFEPAY_WEBHOOK_SECRET
    if (!secret) throw new Error('沒有設定 CAFEPAY_WEBHOOK_SECRET（api/.env）')
    const params = new URLSearchParams((req.get('cafepay-signature') ?? '').replaceAll(',', '&'))
    const t = Number(params.get('t'))
    const given = Buffer.from(params.get('v1') ?? '', 'hex')
    if (!req.rawBody || !Number.isInteger(t)) throw new UnauthorizedException('簽章格式不對')
    if (Math.abs(this.clock.now().getTime() / 1000 - t) > TOLERANCE_SECONDS) throw new UnauthorizedException('簽章已過期')
    const expected = createHmac('sha256', secret).update(`${t}.`).update(req.rawBody).digest()
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new UnauthorizedException('簽章不符')
    return true
  }
}
