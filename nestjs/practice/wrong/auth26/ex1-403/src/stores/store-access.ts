import { ForbiddenException, NotFoundException } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import type { PrismaService } from '../prisma.service.js'

// 根本原因的修法：「這個人能不能碰這間門市」只寫在這裡，每個 /stores/:storeId/... 的 service 都先呼叫它
// 店長：同一個品牌（租戶）的門市；店員：只有自己的門市。不能存取與不存在一律 404，不洩漏門市存不存在
export async function assertStoreAccess(prisma: PrismaService, user: Principal, storeId: number) {
  if (user.role !== 'manager' && user.storeId !== storeId) throw new NotFoundException()
  const store = await prisma.store.findFirst({ where: { id: storeId, tenantId: user.tenantId }, select: { id: true } })
  if (!store) throw new ForbiddenException()
}
