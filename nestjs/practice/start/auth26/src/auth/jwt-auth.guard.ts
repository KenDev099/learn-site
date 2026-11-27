import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { CLOCK, type Clock } from '../clock.js'
import { PrismaService } from '../prisma.service.js'
import { IS_PUBLIC } from './decorators.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true
    const req = ctx.switchToHttp().getRequest()
    const [scheme, token] = String(req.headers.authorization ?? '').split(' ')
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException()
    let payload: { sub: number; ver: number }
    try {
      payload = await this.jwt.verifyAsync(token, { clockTimestamp: Math.floor(this.clock.now() / 1000) })
    } catch {
      throw new UnauthorizedException()
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || user.disabledAt || user.tokenVersion !== payload.ver) throw new UnauthorizedException()
    req.user = user
    return true
  }
}
