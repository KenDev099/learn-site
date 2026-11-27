import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Role } from '../tenancy/permissions.js'

// JwtAuthGuard 驗過 token、查過 membership 之後放在 req.auth。role 是資料庫裡現在的角色，不是 token 裡的
export type Principal = { userId: string; tenantId: string; role: Role }

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => ctx.switchToHttp().getRequest().auth)
