// 登入（v2.8.0，SEC-7）：POST /auth/login 驗證帳號密碼，成功後發一個簽章過的 HttpOnly cookie（sid＝帳號 id）
// 之後的請求由 LoginGuard 讀 cookie，找出「現在是誰」，放在 req.account；@CurrentAccount() 拿得到
// cookie 的簽章密鑰是 SESSION_SECRET（app.module.ts 套用 cookie-parser）。被改過的 cookie 簽章不對，會被當成沒登入
import { scryptSync, timingSafeEqual } from 'node:crypto'
import {
  Body, CanActivate, Controller, createParamDecorator, ExecutionContext, HttpCode, Injectable, Module, Post, Res, UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { PrismaService } from '../common/prisma.service.js'

export type Account = { id: number, role: 'customer' | 'staff', customerId: number | null }
type AuthedRequest = Request & { account?: Account }

const LoginRequest = z.object({ username: z.string().min(1), password: z.string().min(1) })
type LoginRequest = z.infer<typeof LoginRequest>

// 雜湊的格式：scrypt$<salt>$<hash 的 hex>
function passwordMatches(password: string, stored: string) {
  const [algo, salt, hex] = stored.split('$')
  if (algo !== 'scrypt' || !salt || !hex) return false
  const expected = Buffer.from(hex, 'hex')
  return timingSafeEqual(scryptSync(password, salt, expected.length), expected)
}

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body({ schema: LoginRequest }) body: LoginRequest, @Res({ passthrough: true }) res: Response) {
    const account = await this.prisma.account.findUnique({ where: { username: body.username } })
    // 帳號不存在和密碼錯回一樣的訊息：不讓人試出哪些帳號存在
    if (!account || !passwordMatches(body.password, account.passwordHash)) {
      throw new UnauthorizedException({ code: 'LOGIN_FAILED', message: '帳號或密碼不對' })
    }
    res.cookie('sid', String(account.id), { signed: true, httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 })
    return { role: account.role, customerId: account.customerId }
  }
}

// 要登入才能用的端點加 @UseGuards(LoginGuard)：沒登入回 401
@Injectable()
export class LoginGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthedRequest>()
    const id = Number(req.signedCookies?.sid)   // 簽章不對時 cookie-parser 給 false → NaN
    const account = Number.isInteger(id) ? await this.prisma.account.findUnique({ where: { id } }) : null
    if (!account) throw new UnauthorizedException({ code: 'LOGIN_REQUIRED', message: '請先登入' })
    req.account = { id: account.id, role: account.role === 'staff' ? 'staff' : 'customer', customerId: account.customerId }
    return true
  }
}

// 控制器的參數：@CurrentAccount() account: Account（要跟 LoginGuard 一起用）
export const CurrentAccount = createParamDecorator((_: unknown, context: ExecutionContext) => {
  return context.switchToHttp().getRequest<AuthedRequest>().account!
})

@Module({ controllers: [AuthController], providers: [LoginGuard], exports: [LoginGuard] })
export class AuthModule {}
