import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createHash, randomBytes } from 'node:crypto'
import { PasswordService } from '../auth/password.service.js'
import { RefreshService } from '../auth/refresh.service.js'
import { CLOCK, type Clock } from '../clock.js'
import { Mailer } from '../mailer.js'
import { PrismaService } from '../prisma.service.js'

const RESET_TTL_MS = 30 * 60 * 1000
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly refresh: RefreshService,
    private readonly mailer: Mailer,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // 不管 email 存不存在都回同一句話（第 16 課）
  async request(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (user) {
      const token = randomBytes(32).toString('base64url')
      const now = this.clock.now()
      await this.prisma.$transaction([
        // 新申請時，這個人舊的 token 全部作廢
        this.prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date(now) } }),
        this.prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256(token), createdAt: new Date(now), expiresAt: new Date(now + RESET_TTL_MS) },
        }),
      ])
      // 網址來自設定，不來自請求的 Host 標頭（Host 標頭注入）
      const link = `${this.config.getOrThrow<string>('APP_URL')}/reset-password?token=${token}`
      await this.mailer.send({ to: user.email, subject: '重設你的咖啡店密碼', text: `點這個連結設定新密碼（30 分鐘內有效）：${link}` })
    }
    return { message: '如果這個 email 有註冊，重設密碼的信已經寄出' }
  }

  async confirm(token: string, password: string) {
    const now = new Date(this.clock.now())
    const tokenHash = sha256(token)
    // 沒用過、沒過期才搶得到；同時送兩次也只有一次成功
    const { count } = await this.prisma.passwordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (count === 0) throw new BadRequestException('連結無效或已過期')
    const { userId } = await this.prisma.passwordReset.findUniqueOrThrow({ where: { tokenHash } })
    // tokenVersion + 1：所有舊的 access token 立刻失效；refresh token 全部撤銷
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(password), tokenVersion: { increment: 1 } },
    })
  }
}
