import { Inject, Injectable, UnauthorizedException } from '@nestjs/common'
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

  // 練習 2：email 不存在、密碼錯、帳號停用，都丟同一個 401
  async login(email: string, password: string): Promise<User> {
    throw new UnauthorizedException('TODO：練習 2')
  }

  // 練習 2：payload 只有 sub 與 ver，iat 用 this.clock 的時間
  async signAccessToken(user: User): Promise<string> {
    throw new Error('TODO：練習 2')
  }
}
