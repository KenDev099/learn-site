import { Injectable, NotFoundException } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: Principal, storeId: number) {
    return this.prisma.order.findMany({ where: { storeId }, orderBy: { id: 'asc' } })
  }

  async get(user: Principal, storeId: number, orderId: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException()
    return order
  }
}
