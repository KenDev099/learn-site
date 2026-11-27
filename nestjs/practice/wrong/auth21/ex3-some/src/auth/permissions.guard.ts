import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from './permissions.decorator.js'
import { permissionsOf, type Permission } from './permissions.js'
import type { AuthRequest } from './principal.js'
import { IS_PUBLIC_KEY } from './public.decorator.js'

// 練習 3：全域的權限 guard，在 JwtAuthGuard 之後執行
// @Public() → 放行；@RequirePermissions(...) → 依資料庫裡目前的角色檢查；兩個都沒有 → 403
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, targets)
    if (!required) throw new ForbiddenException()   // 沒有宣告：預設拒絕

    // request.user.role 是 JwtAuthGuard 這次請求剛從資料庫讀的，不是 token 裡的
    const user = context.switchToHttp().getRequest<AuthRequest>().user
    if (!user) throw new ForbiddenException()
    const granted = permissionsOf(user.role)
    if (required.length > 0 && !required.some(p => granted.has(p))) throw new ForbiddenException()
    return true
  }
}
