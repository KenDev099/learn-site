import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 3：現在只用 id 更新，version 完全沒用到：兩個店員同時改價格，後送出的人會蓋掉前一個人的修改
  async updatePrice(id: number, price: number, version: number) {
    return this.prisma.product.update({
      where: { id },
      data: { price, version: { increment: 1 } },
      select: { id: true, price: true, version: true },
    })
  }
}
