import { Injectable, NotFoundException } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'
import { assertStoreAccess } from '../stores/store-access.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: Principal, storeId: number) {
    return this.prisma.order.findMany({ where: { storeId }, orderBy: { id: 'asc' } })
  }

  async get(user: Principal, storeId: number, orderId: number) {
    await assertStoreAccess(this.prisma, user, storeId)
    // 門市可以存取還不夠：訂單也要真的在這間門市
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId } })
    if (!order) throw new NotFoundException()
    return order
  }
}
