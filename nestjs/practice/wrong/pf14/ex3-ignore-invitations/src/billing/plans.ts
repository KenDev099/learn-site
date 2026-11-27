import { forbidden, planLimit } from '../common/api-error.js'
import type { Tx } from '../prisma/tenant-db.js'

// 方案是程式常數＋tenants.plan（第 14 課，ADR 0006）。這些數字是契約的一部分，測試會驗
export const PLANS = {
  free: { projects: 3, members: 5, storageBytes: 20 * 1024 * 1024 },
  pro: { projects: 100, members: 50, storageBytes: 1024 * 1024 * 1024 },
} as const
export type Plan = keyof typeof PLANS
export const isPlan = (p: unknown): p is Plan => typeof p === 'string' && p in PLANS

// 用量檢查的競態（第 14 課）：同一個交易裡先鎖住租戶那一列，再數、再新增。
// 同一個租戶同時建立第 3、第 4 個 project 的兩個請求會在這裡排隊，第二個數到的已經包含第一個
export async function lockTenant(tx: Tx, tenantId: string) {
  const [row] = await tx.$queryRaw<{ plan: string }[]>`SELECT plan FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`
  if (!row || !isPlan(row.plan)) throw forbidden('租戶不存在')
  return PLANS[row.plan]
}

export async function memberUsage(tx: Pick<Tx, 'membership' | 'invitation'>, tenantId: string) {
  const [members, pending] = await Promise.all([
    tx.membership.count({ where: { tenantId } }),
    tx.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ])
  void pending
  return members   // 錯誤：只算已經加入的成員
}

export async function storageUsage(tx: Pick<Tx, 'file'>) {
  return (await tx.file.aggregate({ _sum: { size: true } }))._sum.size ?? 0
}

export async function assertUnder(limit: number, used: number, what: string) {
  if (used >= limit) throw planLimit(what)
}
