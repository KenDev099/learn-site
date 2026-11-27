import { Injectable } from '@nestjs/common'
import { OutOfStockError, ProductNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderItemInput = { productId: number; quantity: number }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(items: OrderItemInput[]) {
    // 依 productId 由小到大上鎖：每個交易拿鎖的順序都一樣，就不會互相等成死結
    const sorted = items.sort((a, b) => a.productId - b.productId)

    // 互動式交易：callback 丟出例外 → 整筆回滾，前面扣掉的庫存也會還原
    return this.prisma.$transaction(async tx => {
      for (const item of sorted) await this.decrementStock(tx, item)

      const products = await tx.product.findMany({ where: { id: { in: sorted.map(i => i.productId) } } })
      const price = new Map(products.map(p => [p.id, p.price]))
      const lines = sorted.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: price.get(i.productId)! }))
      return tx.order.create({
        data: {
          total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
          items: { create: lines },
        },
        select: { id: true, total: true, items: { select: { productId: true, quantity: true, unitPrice: true } } },
      })
    })
  }

  // helper 收 tx：用 this.prisma 的話，這一句就跑在交易外面
  private async decrementStock(tx: Prisma.TransactionClient, { productId, quantity }: OrderItemInput) {
    // 原子條件更新：UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1
    const { count } = await tx.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    })
    if (count === 1) return
    const product = await tx.product.findUnique({ where: { id: productId } })
    if (!product) throw new ProductNotFoundError(productId)
    throw new OutOfStockError(productId, quantity, product.stock)
  }
}
