import { SetMetadata } from '@nestjs/common'
import type { Role } from './principal.js'

// 預設每個路由都要登入；不用登入的要明寫 @Public()（第 21 課）
export const IS_PUBLIC = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC, true)

// 限定角色；沒寫 @Roles 的路由，登入的人都能進
export const ROLES = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles)
