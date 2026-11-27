import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

// 練習 3：全域的權限 guard，在 JwtAuthGuard 之後執行
// @Public() → 放行；@RequirePermissions(...) → 依資料庫裡目前的角色檢查；兩個都沒有 → 403
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    throw new Error('TODO：練習 3')
  }
}
