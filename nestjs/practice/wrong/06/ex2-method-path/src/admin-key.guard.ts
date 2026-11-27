import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'
import type { Request } from 'express'

// 不讀標記，改用 HTTP 方法與網址判斷
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    if (req.method === 'GET' || !req.path.startsWith('/products')) return true

    const given = req.get('x-admin-key')
    if (!given) throw new UnauthorizedException('需要 X-Admin-Key 標頭')
    const expected = process.env.ADMIN_KEY
    if (!expected) throw new ForbiddenException('伺服器沒有設定 ADMIN_KEY')
    const a = Buffer.from(given)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}
