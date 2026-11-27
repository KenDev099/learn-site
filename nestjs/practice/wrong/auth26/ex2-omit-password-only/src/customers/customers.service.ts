import { Injectable } from '@nestjs/common'
import type { Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'
import { assertStoreAccess } from '../stores/store-access.js'

// 0912345678 → 0912***678：店員叫號、核對夠用，看不到完整號碼
const maskPhone = (phone: string | null) => phone && `${phone.slice(0, 4)}***${phone.slice(-3)}`

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // 常來這間門市的顧客（集點、叫號用）。只選規定的欄位：新增到 User 的欄位不會自動跑進回應
  async list(user: Principal, storeId: number) {
    await assertStoreAccess(this.prisma, user, storeId)
    const rows = await this.prisma.user.findMany({
      where: { storeId, role: 'customer' },
      omit: { passwordHash: true },
      orderBy: { id: 'asc' },
    })
    return rows.map(c => ({ ...c, phone: maskPhone(c.phone) }))
  }
}
