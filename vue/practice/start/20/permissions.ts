// 練習 3 用的權限表（已經寫好，不用改）
// 真正的防線在伺服器：這張表只決定「畫面要不要讓你進去」，API 一定還要自己再檢查一次

export type Role = 'customer' | 'barista' | 'manager'
export type Permission = 'orders:board' | 'menu:edit' | 'reports:view'
export type User = { id: number; name: string; role: Role; storeId?: number }

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  customer: [],
  barista: ['orders:board'],
  manager: ['orders:board', 'menu:edit', 'reports:view'],
}

// 不認得的角色：Object.hasOwn 擋掉 'toString' 這類原型上的名字，一律沒有權限
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user || !Object.hasOwn(ROLE_PERMISSIONS, user.role)) return false
  return ROLE_PERMISSIONS[user.role].includes(permission)
}
