import { Body, Controller, HttpCode, HttpException, HttpStatus, Ip, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import type { Request, Response } from 'express'
import type { User } from '../generated/prisma/client.js'
import { AuthService } from './auth.service.js'
import { Public } from './decorators.js'
import { LoginDto } from './login.dto.js'
import { LoginThrottleService } from './login-throttle.service.js'
import { REFRESH_TTL_MS, RefreshService } from './refresh.service.js'

// refresh token 的 cookie：Path=/auth，/auth/refresh 與 /auth/logout 才收得到；Path 不是 / 所以用 __Secure- 前綴（第 4 課）
export const REFRESH_COOKIE = '__Secure-rt'
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' } as const

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshService,
    private readonly throttle: LoginThrottleService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Ip() ip: string, @Res({ passthrough: true }) res: Response) {
    // 先看限流，被擋就不驗密碼。帳號用輸入的字串當 key，不管它存不存在，計數都一樣
    const gate = this.throttle.check(dto.email, ip)
    if (!gate.allowed) {
      res.setHeader('Retry-After', String(gate.retryAfterSeconds))
      throw new HttpException('嘗試次數太多，請稍後再試', HttpStatus.TOO_MANY_REQUESTS)
    }
    const user = await this.auth.verifyCredentials(dto.email, dto.password)
    if (!user) {
      this.throttle.recordFailure(dto.email, ip)
      throw new UnauthorizedException('email 或密碼不正確')
    }
    this.throttle.recordSuccess(dto.email, ip)
    res.cookie(REFRESH_COOKIE, await this.refresh.issue(user.id), { ...cookieOptions, maxAge: REFRESH_TTL_MS })
    return this.tokens(user)
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async rotate(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const old: unknown = req.cookies?.[REFRESH_COOKIE]
    const result = typeof old === 'string' ? await this.refresh.rotate(old) : null
    if (!result) throw new UnauthorizedException()
    res.cookie(REFRESH_COOKIE, result.token, { ...cookieOptions, maxAge: REFRESH_TTL_MS })
    return this.tokens(result.user)
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[REFRESH_COOKIE]
    if (typeof token === 'string') await this.refresh.revokeFamilyOf(token)
    res.cookie(REFRESH_COOKIE, '', { ...cookieOptions, maxAge: 0 })
  }

  private async tokens(user: User) {
    return { accessToken: await this.auth.issueAccessToken(user) }
  }
}
