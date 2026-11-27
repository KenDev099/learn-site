// 第 18 課的權限表：程式只檢查權限，不檢查角色名稱
export const PERMISSIONS = [
  'menu:read', 'menu:write',
  'order:create', 'order:read', 'order:update_status',
  'order:refund_request', 'order:refund', 'order:refund:large',
  'report:read', 'staff:manage', 'stampcard:adjust',
] as const satisfies readonly `${string}:${string}`[]
export type Permission = (typeof PERMISSIONS)[number]

type RoleDef = { permissions: readonly Permission[]; inherits: readonly string[] }

export const ROLE_DEFS: Readonly<Record<string, RoleDef>> = {
  customer: { permissions: ['menu:read', 'order:create', 'order:read'], inherits: [] },
  barista: { permissions: ['menu:read', 'order:create', 'order:read', 'order:update_status', 'order:refund_request'], inherits: [] },
  shift_lead: { permissions: ['order:refund', 'stampcard:adjust'], inherits: ['barista'] },
  manager: { permissions: ['order:refund:large', 'menu:write', 'report:read'], inherits: ['shift_lead'] },
  owner: { permissions: ['staff:manage'], inherits: ['manager'] },
}

// role 是資料庫來的字串：不認得的角色沒有任何權限，繼承繞成一圈也會停
export function permissionsOf(role: string): Set<Permission> {
  const result = new Set<Permission>()
  const seen = new Set<string>()
  const todo = [role]
  while (todo.length > 0) {
    const r = todo.pop()!
    if (seen.has(r) || !Object.hasOwn(ROLE_DEFS, r)) continue
    seen.add(r)
    for (const p of ROLE_DEFS[r].permissions) result.add(p)
    todo.push(...ROLE_DEFS[r].inherits)
  }
  return result
}
