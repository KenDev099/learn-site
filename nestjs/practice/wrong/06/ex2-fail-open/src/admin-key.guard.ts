import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { AdminOnly } from './admin-only.decorator.js'

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride(AdminOnly, [context.getHandler(), context.getClass()])
    if (!adminOnly) return true

    const given = context.switchToHttp().getRequest<Request>().get('x-admin-key')
    if (!given) throw new UnauthorizedException('需要 X-Admin-Key 標頭')

    const expected = process.env.ADMIN_KEY   // 請求時才讀：模組載入時 .env 可能還沒載入
    if (!expected) return true   // 設定漏了就放行

    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    // timingSafeEqual 遇到長度不同會丟 RangeError（變成 500），先比長度
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
