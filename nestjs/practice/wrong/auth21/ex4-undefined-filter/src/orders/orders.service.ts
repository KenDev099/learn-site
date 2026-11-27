import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 擁有者條件直接寫進 where：查不到和不是你的，結果一樣是「沒有這筆」
  findMine(user: Principal) {
    return this.prisma.order.findMany({ where: { customerId: user.customerId ?? undefined }, orderBy: { id: 'asc' } })
  }

  async findMineById(user: Principal, id: number) {
    if (user.customerId === null) throw new NotFoundException()
    const order = await this.prisma.order.findFirst({ where: { id, customerId: user.customerId } })
    if (!order) throw new NotFoundException()
    return order
  }

  async cancelMine(user: Principal, id: number) {
    const order = await this.findMineById(user, id)
    if (order.status !== 'pending') throw new ConflictException('只有還沒製作的訂單能取消')
    return this.prisma.order.update({ where: { id: order.id }, data: { status: 'cancelled' } })
  }

  async refund(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException()
    if (order.status === 'refunded') throw new ConflictException('這筆訂單已經退款')
    return this.prisma.order.update({ where: { id }, data: { status: 'refunded' } })
  }
}
