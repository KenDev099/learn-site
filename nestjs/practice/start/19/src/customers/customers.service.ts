import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  recentOrders(customerId: number) {
    return this.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, total: true, orderedAt: true },
    })
  }
}
