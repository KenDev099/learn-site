import { Injectable } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // 常來這間門市的顧客（集點、叫號用）
  list(user: Principal, storeId: number) {
    return this.prisma.user.findMany({ where: { storeId, role: 'customer' }, orderBy: { id: 'asc' } })
  }
}
