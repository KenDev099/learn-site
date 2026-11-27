import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { PasswordService } from '../auth/password.service.js'
import { CLOCK, type Clock } from '../clock.js'
import { Mailer } from '../mailer.js'
import { PrismaService } from '../prisma.service.js'

const RESET_TTL_MS = 30 * 60 * 1000

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mailer: Mailer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async request(email: string, host: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user) throw new NotFoundException('這個 email 沒有註冊')
    const token = randomBytes(32).toString('base64url')
    const now = this.clock.now()
    await this.prisma.passwordReset.create({
      data: { userId: user.id, tokenHash: token, createdAt: new Date(now), expiresAt: new Date(now + RESET_TTL_MS) },
    })
    await this.mailer.send({
      to: user.email,
      subject: '重設你的咖啡店密碼',
      text: `點這個連結設定新密碼（30 分鐘內有效）：https://${host}/reset-password?token=${token}`,
    })
    return { message: '重設密碼的信已寄出' }
  }

  async confirm(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({ where: { tokenHash: token } })
    if (!reset) throw new BadRequestException('連結無效或已過期')
    await this.prisma.user.update({ where: { id: reset.userId }, data: { passwordHash: await this.passwords.hash(password) } })
  }
}
