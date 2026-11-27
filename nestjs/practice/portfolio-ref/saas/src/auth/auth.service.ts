import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { randomUUID } from 'node:crypto'
import { ApiError, forbidden } from '../common/api-error.js'
import { RequestContext } from '../common/request-context.js'
import { Prisma } from '../generated/prisma/client.js'
import { TenantDb } from '../prisma/tenant-db.js'
import type { SignupDto } from './auth.dto.js'
import { PasswordService } from './password.service.js'

// 不屬於任何帳號的雜湊：帳號不存在時也算一次，回應時間才不會洩漏 email 有沒有註冊
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$htHLvZx0pBgsDHko/PvTyQ$PuNQnxMoOAYGJaH7omNHkCT9Niu5GZs67N/nsoVFl7M'

@Injectable()
export class AuthService {
  constructor(
    private readonly db: TenantDb,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly ctx: RequestContext,
  ) {}

  // 註冊＝一個交易建立 user＋tenant＋owner membership（第 7 課）。
  // 還沒有租戶的路徑：先在程式產生 tenantId，明確地把上下文設成「這個新租戶」，不是關掉 RLS（第 9 課）
  async signup(dto: SignupDto) {
    const tenantId = randomUUID(), userId = randomUUID()
    Object.assign(this.ctx.store!, { tenantId, userId })
    const passwordHash = await this.passwords.hash(dto.password)
    try {
      return await this.db.tx(async tx => {
        const user = await tx.user.create({ data: { id: userId, email: dto.email, name: dto.name, passwordHash } })
        const tenant = await tx.tenant.create({ data: { id: tenantId, name: dto.tenantName } })
        await tx.membership.create({ data: { tenantId, userId, role: 'owner' } })
        return { user: { id: user.id, email: user.email, name: user.name }, tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan }, role: 'owner' }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ApiError(409, 'EMAIL_TAKEN', '這個 email 已經註冊')
      throw e
    }
  }

  async verifyCredentials(email: string, password: string) {
    const user = await this.db.client.user.findUnique({ where: { email } })
    const ok = await this.passwords.verify(password, user?.passwordHash ?? DUMMY_HASH)
    return user && ok ? user : null
  }

  // 登入時用哪個租戶：最早加入的那個；之後用 switch-tenant 換
  async defaultTenant(userId: string) {
    this.ctx.store!.userId = userId
    const m = await this.db.client.membership.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
    if (!m) throw forbidden('這個帳號不屬於任何租戶')
    return m.tenantId
  }

  async isMember(userId: string, tenantId: string) {
    this.ctx.store!.userId = userId
    return !!(await this.db.client.membership.findFirst({ where: { userId, tenantId } }))
  }

  async tenantsOf(userId: string) {
    const rows = await this.db.client.membership.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
    const tenants = await this.db.client.tenant.findMany({ where: { id: { in: rows.map(r => r.tenantId) } } })
    return { items: rows.map(r => ({ id: r.tenantId, name: tenants.find(t => t.id === r.tenantId)?.name ?? '', role: r.role })), nextCursor: null }
  }

  // access token 只放 sub 與 tid：角色每個請求查資料庫（第 10 課）
  issueAccessToken(userId: string, tenantId: string) {
    return this.jwt.signAsync({ sub: userId, tid: tenantId })
  }
}
