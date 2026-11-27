import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'
import { AdminOnly } from './admin-only.decorator.js'

const ADMIN_KEY = process.env.ADMIN_KEY

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const adminOnly = this.reflector.getAllAndOverride(AdminOnly, [context.getHandler(), context.getClass()])
    if (!adminOnly) return true

    const given = context.switchToHttp().getRequest<Request>().get('x-admin-key')
    if (!given) throw new UnauthorizedException('需要 X-Admin-Key 標頭')

    const expected = ADMIN_KEY
    if (!expected) throw new ForbiddenException('伺服器沒有設定 ADMIN_KEY')   // 設定漏了就全部拒絕

    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    // timingSafeEqual 遇到長度不同會丟 RangeError（變成 500），先比長度
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
