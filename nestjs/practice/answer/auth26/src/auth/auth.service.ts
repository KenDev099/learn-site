import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'
import { PasswordService } from './password.service.js'

// 不屬於任何帳號的 argon2id 雜湊（參數跟真的一樣，花的時間才一樣）
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$htHLvZx0pBgsDHko/PvTyQ$PuNQnxMoOAYGJaH7omNHkCT9Niu5GZs67N/nsoVFl7M'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // 帳號密碼正確而且沒有停用才回傳使用者；其他情況一律 null，讓 controller 回同樣的 401
  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    // 帳號不存在也算一次雜湊：回應時間才不會洩漏「這個 email 有沒有註冊」
    const ok = await this.passwords.verify(password, user?.passwordHash ?? DUMMY_HASH)
    if (!user) return null
    return ok && !user.disabledAt ? user : null
  }

  // payload 只放 sub 與 ver（簽發當時的 tokenVersion）；iat 用 Clock，測試才能控制時間
  issueAccessToken(user: User) {
    return this.jwt.signAsync({ sub: user.id, ver: user.tokenVersion, iat: Math.floor(this.clock.now() / 1000) })
  }
}
