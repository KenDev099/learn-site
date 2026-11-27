import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type ItemInput = { productId: number; quantity: number }
export type PricedLine = { productId: number; name: string; unitPrice: number; quantity: number }

// 報價：用目前的商品資料算出每一項的品名與單價。products 表屬於 catalog，只有這裡會查它
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(items: ItemInput[]): Promise<PricedLine[]> {
    const ids = items.map(i => i.productId)
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } })
    return items.map(({ productId, quantity }) => {
      const p = products.find(x => x.id === productId)
      if (!p) throw new NotFoundException(`找不到商品 ${productId}`)
      return { productId, name: p.name, unitPrice: p.price, quantity }
    })
  }
}
