import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { CLOCK, type Clock } from '../clock.js'
import type { User } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma.service.js'
import { PasswordService } from './password.service.js'

// email 不存在時也驗一次這個雜湊，讓回應時間跟「密碼錯」差不多（第 16 課的列舉）
const DUMMY_HASH = '$argon2id$v=19$m=19456,t=2,p=1$apEg8MQgtVlVD+854FVhJw$VUdCKyRqDZ3dpCMMFt7U1JnjDQNqWMolQdXlq4HWKuo'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async login(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } })
    const ok = await this.passwords.verify(password, user?.passwordHash ?? DUMMY_HASH)
    // 三種失敗用同一個訊息：不讓人從回應分辨「這個 email 有沒有註冊」
    if (!user || !ok || user.disabledAt) throw new UnauthorizedException('帳號或密碼錯誤')
    return user
  }

  async signAccessToken(user: User): Promise<string> {
    // 角色不放進 token：每個請求由 guard 從資料庫讀最新的角色
    return this.jwt.signAsync({ sub: String(user.id), ver: user.tokenVersion, iat: Math.floor(this.clock.now() / 1000) })
  }
}
