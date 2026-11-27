import { Injectable } from '@nestjs/common'
import { OutOfStockError, ProductNotFoundError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderItemInput = { productId: number; quantity: number }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 1、2：這個版本「先讀再寫」，同時有很多人下單就會賣超；扣到一半失敗，前面扣掉的庫存也不會還回來
  async createOrder(items: OrderItemInput[]) {
    const lines = []
    for (const item of items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } })
      if (!product) throw new ProductNotFoundError(item.productId)
      if (product.stock < item.quantity) throw new OutOfStockError(item.productId, item.quantity, product.stock)
      await this.prisma.product.update({
        where: { id: item.productId },
        data: { stock: product.stock - item.quantity },
      })
      lines.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price })
    }
    return this.prisma.order.create({
      data: {
        total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
        items: { create: lines },
      },
      select: { id: true, total: true, items: { select: { productId: true, quantity: true, unitPrice: true } } },
    })
  }
}
