import { SetMetadata } from '@nestjs/common'
import type { Permission } from '../tenancy/permissions.js'

// 每個路由都要宣告它要什麼，沒宣告的一律 403（fail closed，第 10 課）：
//   @Public()            不用登入
//   @Authenticated()     登入就好，不看角色（/me、列出自己的租戶）
//   @Permissions('x')    登入，而且在目前的租戶有這個權限
export const ACCESS = 'access'
export type Access = { public: true } | { authenticated: true } | { permissions: Permission[] }
export const Public = () => SetMetadata(ACCESS, { public: true } satisfies Access)
export const Authenticated = () => SetMetadata(ACCESS, { authenticated: true } satisfies Access)
export const Permissions = (...permissions: Permission[]) => SetMetadata(ACCESS, { permissions } satisfies Access)
