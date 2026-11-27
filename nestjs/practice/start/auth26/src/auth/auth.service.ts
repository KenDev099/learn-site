import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'
import { PasswordService } from './password.service.js'

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
    if (!user) return null
    const ok = await this.passwords.verify(password, user.passwordHash)
    return ok && !user.disabledAt ? user : null
  }

  // payload 只放 sub 與 ver（簽發當時的 tokenVersion）；iat 用 Clock，測試才能控制時間
  issueAccessToken(user: User) {
    return this.jwt.signAsync({ sub: user.id, ver: user.tokenVersion, iat: Math.floor(this.clock.now() / 1000) })
  }
}
