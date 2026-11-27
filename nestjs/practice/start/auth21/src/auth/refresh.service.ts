import { Inject, Injectable } from '@nestjs/common'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'

export const REFRESH_TTL_MS = 14 * 24 * 60 * 60 * 1000   // 14 天

// 練習 5：refresh token 輪替與重用偵測（第 10 課）
@Injectable()
export class RefreshService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // 發一張新的 refresh token（32 bytes 隨機值），資料庫只存 SHA-256。沒給 familyId 就開一個新家族
  async issue(userId: number, familyId?: string): Promise<string> {
    throw new Error('TODO：練習 5')
  }

  // 用舊的換新的：成功回傳使用者與新 token；無效、過期、已撤銷、重用都丟 401，重用時撤銷整個家族
  async rotate(token: string): Promise<{ user: User; refreshToken: string }> {
    throw new Error('TODO：練習 5')
  }

  // 登出：撤銷這張 token 所屬的家族。不認得的 token 什麼都不做
  async revokeFamily(token: string): Promise<void> {
    throw new Error('TODO：練習 5')
  }
}
