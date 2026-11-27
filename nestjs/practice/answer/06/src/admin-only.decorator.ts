import { Reflector } from '@nestjs/core'

// @AdminOnly() 存 true；方法上寫 @AdminOnly(false) 可以蓋掉 class 上的 @AdminOnly()
export const AdminOnly = Reflector.createDecorator<boolean>({ transform: value => value ?? true })
