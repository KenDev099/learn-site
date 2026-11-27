import { Injectable } from '@nestjs/common'
import { ProductNotFoundError, StaleVersionError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // 樂觀鎖：UPDATE … WHERE id = $1 AND version = $2，比對與更新在同一句，資料庫保證只有一個人成功
  async updatePrice(id: number, price: number, version: number) {
    const { count } = await this.prisma.product.updateMany({
      where: { id },
      data: { price, version: { increment: 1 } },
    })
    if (count === 0) {
      const exists = await this.prisma.product.findUnique({ where: { id }, select: { id: true } })
      if (!exists) throw new ProductNotFoundError(id)
      throw new StaleVersionError(id, version)
    }
    return { id, price, version: version + 1 }
  }
}
