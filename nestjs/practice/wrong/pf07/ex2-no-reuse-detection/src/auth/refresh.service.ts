import { Injectable } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { RequestContext } from '../common/request-context.js'
import { TenantDb } from '../prisma/tenant-db.js'

// refresh token（auth 課第 10、21 課）：只存雜湊、輪替、重用就撤銷整個家族。
// token 的格式是「userId.隨機值」：refresh_tokens 的 RLS 只讓人看到自己的列，要先知道是誰才查得到（userId 不是秘密，隨機值才是）
export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type Rotated = { userId: string; tenantId: string; token: string } | { reused: true } | null

@Injectable()
export class RefreshService {
  constructor(private readonly db: TenantDb, private readonly ctx: RequestContext) {}

  async issue(userId: string, tenantId: string, familyId: string = randomUUID()) {
    const token = `${userId}.${randomBytes(32).toString('base64url')}`
    this.ctx.store!.userId = userId
    await this.db.client.refreshToken.create({
      data: { userId, tenantId, familyId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + REFRESH_TTL_MS) },
    })
    return token
  }

  async rotate(token: string): Promise<Rotated> {
    const userId = token.split('.')[0]
    if (!UUID.test(userId)) return null
    this.ctx.store!.userId = userId
    const now = new Date()
    const tokenHash = sha256(token)
    // 條件含 usedAt: null：兩個請求同時用同一個 token，只有一個 count 是 1
    const { count } = await this.db.client.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
    })
    const row = await this.db.client.refreshToken.findUnique({ where: { tokenHash } })
    if (!row) return null
    if (count === 0) return null   // 錯誤寫法：用過的 token 只是拒絕，不撤銷家族
    return { userId, tenantId: row.tenantId, token: await this.issue(userId, row.tenantId, row.familyId) }
  }

  async revokeFamilyOf(token: string) {
    const userId = token.split('.')[0]
    if (!UUID.test(userId)) return
    this.ctx.store!.userId = userId
    const row = await this.db.client.refreshToken.findUnique({ where: { tokenHash: sha256(token) } })
    if (row) await this.revokeFamily(row.familyId)
  }

  private async revokeFamily(familyId: string) {
    await this.db.client.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } })
  }
}
