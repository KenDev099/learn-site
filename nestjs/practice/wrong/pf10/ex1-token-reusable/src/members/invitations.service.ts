import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'node:crypto'
import { AuditService } from '../audit/audit.service.js'
import { PasswordService } from '../auth/password.service.js'
import type { Principal } from '../auth/principal.js'
import { lockTenant, memberUsage } from '../billing/plans.js'
import { ApiError, forbidden, notFound, planLimit } from '../common/api-error.js'
import { RequestContext } from '../common/request-context.js'
import type { Env } from '../config/env.js'
import { TenantDb } from '../prisma/tenant-db.js'
import { rank } from '../tenancy/permissions.js'
import { MailService } from './mail.service.js'
import type { AcceptInvitationDto, InviteDto } from './members.dto.js'

// 邀請 token 的四個條件（auth 課第 26 課）：只存雜湊、一次性、會過期、可撤銷。
// 格式「tenantId.隨機值」：接受邀請時還沒有租戶上下文，先從 token 取出 tenantId 設好上下文，再用雜湊在這個租戶裡找
const TTL_MS = 72 * 60 * 60 * 1000
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const view = (i: { id: string; email: string; role: string; createdAt: Date; expiresAt: Date }) =>
  ({ id: i.id, email: i.email, role: i.role, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() })

@Injectable()
export class InvitationsService {
  private readonly appUrl: string

  constructor(
    private readonly db: TenantDb,
    private readonly ctx: RequestContext,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true })
  }

  async create(me: Principal, dto: InviteDto) {
    if (rank(dto.role) > rank(me.role)) throw forbidden('不能邀請比自己高的角色')
    const token = `${me.tenantId}.${randomBytes(32).toString('base64url')}`
    const invitation = await this.db.tx(async tx => {
      const limits = await lockTenant(tx, me.tenantId)
      const existing = await tx.user.findUnique({ where: { email: dto.email } })
      if (existing && await tx.membership.findFirst({ where: { tenantId: me.tenantId, userId: existing.id } })) {
        throw new ApiError(409, 'ALREADY_MEMBER', '這個人已經是成員')
      }
      // 同一個 email 重新邀請：舊的撤銷，只留最新的一封有效
      await tx.invitation.updateMany({ where: { email: dto.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
      if (await memberUsage(tx, me.tenantId) >= limits.members) throw planLimit('成員數（含待接受的邀請）')
      const inv = await tx.invitation.create({
        data: { tenantId: me.tenantId, email: dto.email, role: dto.role, tokenHash: sha256(token), invitedBy: me.userId, expiresAt: new Date(Date.now() + TTL_MS) },
      })
      await this.audit.record(tx, 'invitation.created', 'invitation', inv.id)
      return inv
    })
    // 連結的網址來自設定，不來自請求的 Host 標頭：攻擊者改 Host 就能讓信裡的連結指到他的網站（第 10 課）
    const link = `${this.appUrl}/invitations/accept?token=${encodeURIComponent(token)}`
    await this.mail.send(dto.email, '你被邀請加入團隊', `點這個連結接受邀請（72 小時內有效）：\n${link}\n`)
    return view(invitation)
  }

  async list() {
    const rows = await this.db.client.invitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'asc' } })
    return { items: rows.map(view), nextCursor: null }
  }

  async revoke(id: string) {
    await this.db.tx(async tx => {
      const { count } = await tx.invitation.updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
      if (!count) throw notFound()
      await this.audit.record(tx, 'invitation.revoked', 'invitation', id)
    })
  }

  // 已有帳號：直接加入（token 證明了 email 是他的）；還沒有帳號：要給 name 與 password
  async accept(dto: AcceptInvitationDto) {
    const tenantId = dto.token.split('.')[0]
    if (!UUID.test(tenantId)) throw new ApiError(404, 'INVITATION_NOT_FOUND', '邀請不存在')
    const store = this.ctx.store!
    store.tenantId = tenantId
    const inv = await this.db.client.invitation.findUnique({ where: { tokenHash: sha256(dto.token) } })
    if (!inv) throw new ApiError(404, 'INVITATION_NOT_FOUND', '邀請不存在')
    if (inv.revokedAt) throw new ApiError(410, 'INVITATION_REVOKED', '邀請已經被撤銷')
    // 錯誤寫法：沒檢查用過了沒（「接受兩次也只是 upsert 同一筆 membership，沒差」）
    if (inv.expiresAt <= new Date()) throw new ApiError(410, 'INVITATION_EXPIRED', '邀請已經過期')
    let user = await this.db.client.user.findUnique({ where: { email: inv.email } })
    if (!user && (!dto.name || !dto.password)) throw new ApiError(400, 'VALIDATION_FAILED', '新帳號要填 name 與 password')
    const passwordHash = user ? '' : await this.passwords.hash(dto.password!)
    return this.db.tx(async tx => {
      // 條件式更新：同一個 token 同時被用兩次，只有一個成功
      const { count } = await tx.invitation.updateMany({ where: { id: inv.id, revokedAt: null }, data: { acceptedAt: new Date() } })
      if (!count) throw new ApiError(410, 'INVITATION_USED', '邀請已經用過')
      user ??= await tx.user.create({ data: { email: inv.email, name: dto.name!, passwordHash } })
      store.userId = user.id
      await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        create: { tenantId, userId: user.id, role: inv.role }, update: {},
      })
      await this.audit.record(tx, 'invitation.accepted', 'invitation', inv.id)
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } })
      return { tenant: { id: tenant.id, name: tenant.name }, role: inv.role }
    })
  }
}
