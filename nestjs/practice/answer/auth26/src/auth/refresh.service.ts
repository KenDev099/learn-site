import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'

export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

@Injectable()
export class RefreshService {
  constructor(private readonly prisma: PrismaService, @Inject(CLOCK) private readonly clock: Clock) {}

  // 發一個新的 refresh token；familyId 不給就是新的一次登入
  async issue(userId: number, familyId: string = randomUUID()) {
    const token = randomBytes(32).toString('base64url')
    const now = this.clock.now()
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(token), createdAt: new Date(now), expiresAt: new Date(now + REFRESH_TTL_MS) },
    })
    return token
  }

  // 用舊的換新的。失敗回 null
  async rotate(token: string): Promise<{ user: User; token: string } | null> {
    const now = new Date(this.clock.now())
    const tokenHash = sha256(token)
    // 用過的不刪，標記 usedAt：之後再被拿來用，才認得出是「重用」。
    // updateMany 的條件含 usedAt: null，兩個請求同時用同一個 token 時只有一個 count 是 1（PostgreSQL 第 19 課）
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } })
    if (!row) return null
    if (count === 0) {
      // 重用：分不出誰是真的使用者，整個家族撤銷（第 10 課）
      if (row.usedAt) await this.revokeFamily(row.familyId)
      return null
    }
    if (row.user.disabledAt) return null
    return { user: row.user, token: await this.issue(row.userId, row.familyId) }
  }

  async revokeFamilyOf(token: string) {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } })
    if (row) await this.revokeFamily(row.familyId)
  }

  async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date(this.clock.now()) } })
  }

  async revokeAllForUser(userId: number) {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(this.clock.now()) } })
  }
}
