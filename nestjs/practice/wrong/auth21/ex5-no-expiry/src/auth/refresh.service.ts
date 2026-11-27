import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'

export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000   // 14 天

// token 是 256 bits 的隨機值，不需要慢雜湊；SHA-256 讓資料庫外洩時拿不到能用的 token
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex')

// 練習 5：refresh token 輪替與重用偵測（第 10 課）
@Injectable()
export class RefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async issue(userId: number, familyId: string = randomUUID()): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const now = this.clock.now()
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(token), createdAt: new Date(now), expiresAt: new Date(now + REFRESH_TTL_MS) },
    })
    return token
  }

  async rotate(token: string): Promise<{ user: User; refreshToken: string }> {
    const now = new Date(this.clock.now())
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } })
    if (!row) throw new UnauthorizedException()
    // 家族裡任何一張被撤銷過，整個家族都不能用：擋住「偵測到重用的同時，另一邊剛換到的新 token」
    const revoked = await this.prisma.refreshToken.count({ where: { familyId: row.familyId, revokedAt: { not: null } } })
    if (revoked > 0 || row.user.disabledAt) throw new UnauthorizedException()
    // 檢查與標記在同一句 UPDATE 裡：同時到的兩個請求只有一個改得到（count = 1）
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    })
    if (claimed.count === 0) {
      if (row.expiresAt > now) await this.revoke(row.familyId, now)   // 沒過期卻搶不到：已經用過了，視為重用
      throw new UnauthorizedException()
    }
    return { user: row.user, refreshToken: await this.issue(row.userId, row.familyId) }
  }

  async revokeFamily(token: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } })
    if (row) await this.revoke(row.familyId, new Date(this.clock.now()))
  }

  private async revoke(familyId: string, at: Date) {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: at } })
  }
}
