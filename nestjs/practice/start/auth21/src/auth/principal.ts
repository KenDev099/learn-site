import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

// 認證之後「這個請求是誰」：JwtAuthGuard 從資料庫讀出最新狀態放進 request.user
export type Principal = {
  id: number
  email: string
  role: string
  customerId: number | null
}

export type AuthRequest = Request & { user?: Principal }

// handler 參數用 @CurrentUser() user: Principal 拿到它
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Principal => {
  const user = ctx.switchToHttp().getRequest<AuthRequest>().user
  if (!user) throw new Error('request.user 是空的：這個路由是 @Public()，或 JwtAuthGuard 沒有註冊')
  return user
})
