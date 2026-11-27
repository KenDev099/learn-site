import type { Permission } from './permissions.js'

// 練習 3：@RequirePermissions('order:refund') 宣告這個路由需要的權限
//         @RequirePermissions() 不帶參數 = 明確宣告「登入就可以」
export const PERMISSIONS_KEY = 'permissions'

// TODO：用 SetMetadata 把 permissions 陣列存起來。現在是什麼都不做的裝飾器
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator => () => {}
