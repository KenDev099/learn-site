import { Injectable } from '@nestjs/common'
import { ApiError, forbidden, notFound } from '../common/api-error.js'
import { RequestContext } from '../common/request-context.js'
import { AuditService } from '../audit/audit.service.js'
import type { Principal } from '../auth/principal.js'
import { TenantDb, type Tx } from '../prisma/tenant-db.js'
import { rank, type Role } from '../tenancy/permissions.js'

@Injectable()
export class MembersService {
  constructor(private readonly db: TenantDb, private readonly audit: AuditService, private readonly ctx: RequestContext) {}

  // memberships 不在 TenantDb 的自動條件裡（登入時要用「自己的」條件查），所以這裡明寫 tenantId；RLS 一樣會擋
  private get tenantId() {
    return this.ctx.tenantId!
  }

  async list() {
    const rows = await this.db.client.membership.findMany({ where: { tenantId: this.tenantId }, orderBy: { createdAt: 'asc' } })
    const users = await this.db.client.user.findMany({ where: { id: { in: rows.map(r => r.userId) } } })
    return {
      items: rows.map(r => {
        const u = users.find(x => x.id === r.userId)!
        return { userId: r.userId, email: u.email, name: u.name, role: r.role, joinedAt: r.createdAt.toISOString() }
      }),
      nextCursor: null,
    }
  }

  // 角色規則（第 10 課）：不能動比自己高的人、不能給比自己高的角色、最後一位 owner 不能降級
  async changeRole(me: Principal, userId: string, role: Role) {
    return this.db.tx(async tx => {
      const target = await this.find(tx, userId)
      this.assertCanManage(me, target.role as Role)
      // 錯誤寫法：沒檢查要給的角色比自己高
      if (target.role === 'owner' && role !== 'owner') await this.assertNotLastOwner(tx)
      await tx.membership.update({ where: { tenantId_userId: { tenantId: me.tenantId, userId } }, data: { role } })
      await this.audit.record(tx, 'member.role_changed', 'user', userId)
      return { userId, role }
    })
  }

  async remove(me: Principal, userId: string) {
    await this.db.tx(async tx => {
      const target = await this.find(tx, userId)
      if (userId !== me.userId) this.assertCanManage(me, target.role as Role)   // 自己離開不用權限
      if (target.role === 'owner') await this.assertNotLastOwner(tx)
      await tx.membership.delete({ where: { tenantId_userId: { tenantId: me.tenantId, userId } } })
      await this.audit.record(tx, 'member.removed', 'user', userId)
    })
  }

  private async find(tx: Tx, userId: string) {
    const m = await tx.membership.findFirst({ where: { tenantId: this.tenantId, userId } })
    if (!m) throw notFound()
    return m
  }

  private assertCanManage(me: Principal, targetRole: Role) {
    if (rank(targetRole) > rank(me.role)) throw forbidden('不能管理比自己高的角色')
  }

  // 鎖住所有 owner 的列再數：兩個人同時把對方降級，也不會變成沒有 owner
  private async assertNotLastOwner(tx: Tx) {
    const owners = await tx.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM memberships WHERE tenant_id = ${this.tenantId}::uuid AND role = 'owner' FOR UPDATE`
    if (owners.length <= 1) throw new ApiError(409, 'LAST_OWNER', '最後一位 owner 不能被降級或移除')
  }
}
