import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import { CLOCK, type Clock } from '../clock.js'
import { PrismaService } from '../prisma.service.js'
import type { AuthRequest } from './principal.js'
import { IS_PUBLIC_KEY } from './public.decorator.js'

type AccessClaims = { sub: string; ver: number }

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
    if (isPublic) return true

    const http = context.switchToHttp()
    const req = http.getRequest<AuthRequest>()
    const res = http.getResponse<Response>()
    const token = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
    if (!token) {
      res.setHeader('WWW-Authenticate', 'Bearer')   // 401 一定要帶 WWW-Authenticate（RFC 9110）
      throw new UnauthorizedException()
    }
    const fail = () => {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
      return new UnauthorizedException()          // 不說是過期、竄改還是被撤銷
    }

    let claims: AccessClaims
    try {
      // 演算法、iss、aud 在 JwtModule 的 verifyOptions；「現在幾點」用注入的時鐘
      claims = await this.jwt.verifyAsync<AccessClaims>(token, { clockTimestamp: Math.floor(this.clock.now() / 1000) })
    } catch {
      throw fail()
    }

    // 每個請求查一次使用者：停權、降權、登出全部裝置（tokenVersion + 1）立即生效
    const user = await this.prisma.user.findUnique({ where: { id: Number(claims.sub) } })
    if (!user || user.disabledAt || user.tokenVersion !== claims.ver) throw fail()

    req.user = { id: user.id, email: user.email, role: user.role, customerId: user.customerId }
    return true
  }
}
