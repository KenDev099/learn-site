import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { User } from '../generated/prisma/client.js'

// 通過 JwtAuthGuard 之後，request.user 是資料庫裡這個人目前的資料（不是 token 裡的）
export type Principal = User
export type Role = 'customer' | 'barista' | 'manager'

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal =>
  ctx.switchToHttp().getRequest().user)
