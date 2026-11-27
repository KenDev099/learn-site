import { Injectable } from '@nestjs/common'
import { OutOfStockError, ProductNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type OrderItemInput = { productId: number; quantity: number }

const orderSelect = {
  id: true,
  customerId: true,
  total: true,
  items: { select: { productId: true, quantity: true, unitPrice: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.OrderSelect

// 第 15 課做完的版本：這一課不改它，只替它寫整合測試
@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 整張訂單在同一個交易裡：任何一項失敗，前面扣掉的庫存一起回滾
  createOrder(customerId: number, items: OrderItemInput[]) {
    return this.prisma.$transaction(tx => this.placeOrder(tx, customerId, items))
  }

  findOrder(id: number) {
    return this.prisma.order.findUniqueOrThrow({ where: { id }, select: orderSelect })
  }

  private async placeOrder(tx: Prisma.TransactionClient, customerId: number, items: OrderItemInput[]) {
    const lines: { productId: number; quantity: number; unitPrice: number }[] = []
    // 依 productId 由小到大處理：兩張訂單鎖商品的順序一樣，就不會互相等待（死結）
    for (const item of [...items].sort((a, b) => a.productId - b.productId)) {
      const product = await tx.product.findUnique({ where: { id: item.productId }, select: { price: true } })
      if (!product) throw new ProductNotFoundError(item.productId)
      await this.decrementStock(tx, item)
      // 單價快照：把「現在的價格」存進訂單明細，之後商品改價不影響這張訂單
      lines.push({ productId: item.productId, quantity: item.quantity, unitPrice: product.price })
    }
    return tx.order.create({
      data: {
        customerId,
        total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
        items: { create: lines },
      },
      select: orderSelect,
    })
  }

  // 條件式更新：「庫存夠」和「扣庫存」是同一句 SQL，並發時不會賣超
  private async decrementStock(tx: Prisma.TransactionClient, { productId, quantity }: OrderItemInput) {
    const { count } = await tx.product.updateMany({
      where: { id: productId, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    })
    if (count === 0) {
      const { stock } = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { stock: true } })
      throw new OutOfStockError(productId, quantity, stock)
    }
  }
}
