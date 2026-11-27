import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiCookieAuth, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { ApiError, forbidden } from '../common/api-error.js'
import { ApiErrors } from '../common/openapi.js'
import type { Env } from '../config/env.js'
import { LoginDto, SignupDto, SwitchTenantDto } from './auth.dto.js'
import { AuthService } from './auth.service.js'
import { Authenticated, Public } from './decorators.js'
import { LoginThrottleService } from './login-throttle.service.js'
import { CurrentUser, type Principal } from './principal.js'
import { REFRESH_TTL_MS, RefreshService } from './refresh.service.js'

// refresh token 放 HttpOnly cookie，Path 限 /api/v1/auth：只有 refresh、logout 收得到（auth 課第 4 課）
export const REFRESH_COOKIE = 'refresh_token'
const invalid = () => new ApiError(401, 'INVALID_CREDENTIALS', 'email 或密碼不正確')
const unauthenticated = () => new ApiError(401, 'UNAUTHENTICATED', '請重新登入')

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookie: { httpOnly: true; secure: boolean; sameSite: 'strict'; path: string }

  constructor(
    private readonly auth: AuthService,
    private readonly refresh: RefreshService,
    private readonly throttle: LoginThrottleService,
    config: ConfigService<Env, true>,
  ) {
    this.cookie = { httpOnly: true, secure: config.get('COOKIE_SECURE', { infer: true }), sameSite: 'strict', path: '/api/v1/auth' }
  }

  @Public()
  @Post('signup')
  @ApiErrors(400, 409)
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto)
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiErrors(400, 401, 429)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const wait = await this.throttle.retryAfter(dto.email)
    if (wait) {
      res.setHeader('Retry-After', String(wait))
      throw new ApiError(429, 'RATE_LIMITED', '嘗試次數太多，請稍後再試')
    }
    const user = await this.auth.verifyCredentials(dto.email, dto.password)
    if (!user) {
      await this.throttle.recordFailure(dto.email)
      throw invalid()   // 帳號不存在與密碼錯回一樣的東西
    }
    await this.throttle.reset(dto.email)
    return this.issue(res, user.id, await this.auth.defaultTenant(user.id))
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiErrors(401)
  async rotate(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const old: unknown = req.cookies?.[REFRESH_COOKIE]
    const r = typeof old === 'string' ? await this.refresh.rotate(old) : null
    if (r && 'reused' in r) throw new ApiError(401, 'REFRESH_REUSED', 'refresh token 被重複使用，請重新登入')
    if (!r) throw unauthenticated()
    if (!(await this.auth.isMember(r.userId, r.tenantId))) throw unauthenticated()   // 已經被移出這個租戶
    res.cookie(REFRESH_COOKIE, r.token, { ...this.cookie, maxAge: REFRESH_TTL_MS })
    return { accessToken: await this.auth.issueAccessToken(r.userId, r.tenantId) }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token: unknown = req.cookies?.[REFRESH_COOKIE]
    if (typeof token === 'string') await this.refresh.revokeFamilyOf(token)
    res.clearCookie(REFRESH_COOKIE, this.cookie)
  }

  @Authenticated()
  @Get('tenants')
  @ApiBearerAuth()
  @ApiErrors(401)
  tenants(@CurrentUser() me: Principal) {
    return this.auth.tenantsOf(me.userId)
  }

  @Authenticated()
  @Post('switch-tenant')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiErrors(400, 401, 403)
  async switchTenant(@CurrentUser() me: Principal, @Body() dto: SwitchTenantDto, @Res({ passthrough: true }) res: Response) {
    if (!(await this.auth.isMember(me.userId, dto.tenantId))) throw forbidden('你不是這個租戶的成員')
    return this.issue(res, me.userId, dto.tenantId)
  }

  private async issue(res: Response, userId: string, tenantId: string) {
    res.cookie(REFRESH_COOKIE, await this.refresh.issue(userId, tenantId), { ...this.cookie, maxAge: REFRESH_TTL_MS })
    return { accessToken: await this.auth.issueAccessToken(userId, tenantId) }
  }
}
