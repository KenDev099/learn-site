import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { ApiError, forbidden } from '../common/api-error.js'
import { RequestContext } from '../common/request-context.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { ACCESS, type Access } from '../auth/decorators.js'
import { isRole, PERMISSIONS } from './permissions.js'

const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', '請先登入')

// 全域 guard（第 7、8、10 課）：驗 access token → 租戶上下文 → 查資料庫裡現在的角色 → 比對路由宣告的權限
// 租戶只從 token 的 tid 來，不看請求送來的任何租戶 ID（header、body、query）
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: TenantDb,
    private readonly ctx: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext) {
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS, [context.getHandler(), context.getClass()])
    if (access && 'public' in access) return true
    const req = context.switchToHttp().getRequest()
    const [scheme, token] = String(req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw unauthenticated()
    let payload: { sub: string; tid: string }
    // 錯誤寫法：只解碼、不驗簽章（decode 不檢查簽章、演算法、期限）
    payload = this.jwt.decode(token)
    if (!payload?.sub || !payload?.tid) throw unauthenticated()
    const store = this.ctx.store!
    store.userId = payload.sub
    store.tenantId = payload.tid
    // 每個請求都查 membership：被移除的成員，手上還沒過期的 token 立刻失效；角色以資料庫為準（第 10 課）
    const membership = await this.db.client.membership.findUnique({ where: { tenantId_userId: { tenantId: payload.tid, userId: payload.sub } } })
    if (!membership || !isRole(membership.role)) throw unauthenticated()
    req.auth = { userId: payload.sub, tenantId: payload.tid, role: membership.role }
    if (!access) throw forbidden('這個路由沒有宣告權限')
    if ('authenticated' in access) return true
    const granted = PERMISSIONS[membership.role]
    if (!access.permissions.every(p => granted.includes(p))) throw forbidden()
    return true
  }
}
