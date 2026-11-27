import { createParamDecorator, type ExecutionContext } from '@nestjs/common'

export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().requestId,
)
