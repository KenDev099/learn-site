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
    if (!expected) throw new ForbiddenException('伺服器沒有設定 ADMIN_KEY')   // 設定漏了就全部拒絕

    // 比的是字串的字數，不是位元組數
    return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  }
}
