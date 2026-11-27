import { Injectable } from '@nestjs/common'
import { OrderNotFoundError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 3：先在 schema.prisma 寫 OrderItem，再用巢狀寫入一次建立訂單與明細
  async create(dto: CreateOrderDto) {
    return this.prisma.order.create({ data: { customerId: dto.customerId, total: 0 } })
  }

  // 練習 4：回傳固定的形狀 { id, status, orderedAt, customer: { id, name }, items: [...], total }
  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { customer: true } })
    if (!order) throw new OrderNotFoundError(id)
    return order
  }
}
