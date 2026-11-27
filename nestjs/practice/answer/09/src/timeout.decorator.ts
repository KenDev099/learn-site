import { Reflector } from '@nestjs/core'

// @Timeout(ms)：這個路由（或整個 controller）最多等幾毫秒
export const Timeout = Reflector.createDecorator<number>()
