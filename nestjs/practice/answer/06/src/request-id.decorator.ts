import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'

export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<Request>().requestId,
)
