import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES } from './decorators.js'
import type { Principal, Role } from './principal.js'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()])
    if (!roles) return true
    const user: Principal | undefined = ctx.switchToHttp().getRequest().user
    if (!user || !roles.includes(user.role as Role)) throw new ForbiddenException()
    return true
  }
}
