import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Request, Response } from 'express'
import { LoginDto } from './login.dto.js'
import { AuthService } from './auth.service.js'
import { permissionsOf } from './permissions.js'
import { RequirePermissions } from './permissions.decorator.js'
import { CurrentUser, type Principal } from './principal.js'
import { Public } from './public.decorator.js'
import { REFRESH_TTL_MS, RefreshService } from './refresh.service.js'

// Path 不是 /，所以不能用 __Host-（它要求 Path=/）；__Secure- 只要求 Secure（第 4 課）
const COOKIE = '__Secure-rt'
const cookieOptions: CookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' }

@Controller()
export class AuthController {
  private readonly trustedOrigins: string[]

  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshService,
    config: ConfigService,
  ) {
    this.trustedOrigins = config.getOrThrow<string>('CORS_ORIGINS').split(',')
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(body.email, body.password)
    res.cookie(COOKIE, await this.refresh.issue(user.id), { ...cookieOptions, maxAge: REFRESH_TTL_MS })
    return { accessToken: await this.auth.signAccessToken(user) }
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refreshToken(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.checkOrigin(req)
    const token: unknown = req.cookies?.[COOKIE]
    if (typeof token !== 'string') throw new UnauthorizedException()
    const { user, refreshToken } = await this.refresh.rotate(token)
    res.cookie(COOKIE, refreshToken, { ...cookieOptions, maxAge: REFRESH_TTL_MS })
    return { accessToken: await this.auth.signAccessToken(user) }
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.checkOrigin(req)
    const token: unknown = req.cookies?.[COOKIE]
    if (typeof token === 'string') await this.refresh.revokeFamily(token)
    // 清 cookie 要用同樣的名稱與 Path，不然瀏覽器會當成另一個 cookie
    res.cookie(COOKIE, '', { ...cookieOptions, maxAge: 0 })
  }

  @RequirePermissions()   // 登入就可以
  @Get('me')
  me(@CurrentUser() user: Principal) {
    return { ...user, permissions: [...permissionsOf(user.role)] }
  }

  // 第 6 課的 CSRF 規則：cookie 會自動帶上，所以要確認請求來自自己的前台
  private checkOrigin(req: Request) {
    const site = req.headers['sec-fetch-site']
    const origin = req.headers.origin
    const trusted = origin !== undefined && this.trustedOrigins.some(o => origin.startsWith(o))
    if (site === 'same-origin' || site === 'none') return
    if (site !== undefined) { if (trusted) return; throw new ForbiddenException() }
    if (origin === undefined) return   // 沒有 Fetch Metadata 也沒有 Origin：不是瀏覽器（POS App、curl）
    if (trusted || sameHost(origin, req.headers.host)) return
    throw new ForbiddenException()
  }
}

function sameHost(origin: string, host: string | undefined) {
  try { return new URL(origin).host === host } catch { return false }   // Origin: null 解析失敗 → 拒絕
}
