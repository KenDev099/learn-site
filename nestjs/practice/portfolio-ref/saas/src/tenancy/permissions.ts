// 權限矩陣是契約的一部分（CONTRACT-saas.md）：角色 → 能做什麼。程式只問「有沒有這個權限」，不在各處比較角色名稱
export const ROLES = ['viewer', 'member', 'admin', 'owner'] as const
export type Role = (typeof ROLES)[number]
export const rank = (r: Role) => ROLES.indexOf(r)
export const isRole = (r: unknown): r is Role => ROLES.includes(r as Role)

const viewer = ['projects:read', 'tags:read', 'files:read', 'exports:read', 'members:read', 'billing:read'] as const
const member = [...viewer, 'projects:write', 'tags:write', 'files:write', 'exports:create'] as const
const admin = [...member, 'projects:delete', 'tags:delete', 'members:write', 'invitations:read', 'invitations:write', 'audit:read'] as const
const owner = [...admin, 'billing:write'] as const

export type Permission = (typeof owner)[number]
export const PERMISSIONS: Record<Role, readonly Permission[]> = { viewer, member, admin, owner }
