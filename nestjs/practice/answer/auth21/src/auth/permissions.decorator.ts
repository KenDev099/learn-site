import { SetMetadata } from '@nestjs/common'
import type { Permission } from './permissions.js'

// 練習 3：@RequirePermissions('order:refund') 宣告這個路由需要的權限
//         @RequirePermissions() 不帶參數 = 明確宣告「登入就可以」
export const PERMISSIONS_KEY = 'permissions'

export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions)
