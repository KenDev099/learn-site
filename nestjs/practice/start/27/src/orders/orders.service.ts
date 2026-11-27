import { Injectable } from '@nestjs/common'
import { OrderNotFoundError, OutOfStockError, ProductNotFoundError } from '../errors/domain-errors.js'
import type { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto, OrderItemDto } from './create-order.dto.js'

const ORDER_SELECT = {
  id: true, customerId: true, status: true, total: true, createdAt: true,
  items: { select: { productId: true, name: true, unitPrice: true, quantity: true }, orderBy: { id: 'asc' } },
} as const

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 1：加上 Idempotency-Key
  create(dto: CreateOrderDto) {
    return this.prisma.$transaction(tx => this.placeOrder(tx, dto))
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT })
    if (!order) throw new OrderNotFoundError(id)
    return order
  }

  // 第 18 課的條件更新：只有 pending 的訂單會變成 paid。回傳 null 代表沒改到（不存在、已經付過或取消了）
  // 收 tx：讓呼叫的人（PaymentsService）把它放進自己的交易
  async markPaid(tx: Prisma.TransactionClient, id: number) {
    const { count } = await tx.order.updateMany({ where: { id, status: 'pending' }, data: { status: 'paid', paidAt: new Date() } })
    if (count === 0) return null
    return tx.order.findUniqueOrThrow({ where: { id }, select: { id: true, customerId: true, total: true } })
  }

  // 第 15 課：交易裡原子扣庫存（依 productId 排序上鎖，避免死結）、存單價快照
  private async placeOrder(tx: Prisma.TransactionClient, dto: CreateOrderDto) {
    const items = [...dto.items].sort((a, b) => a.productId - b.productId)
    const lines = []
    for (const item of items) lines.push(await this.takeStock(tx, item))
    const created = await tx.order.create({
      data: {
        customerId: dto.customerId,
        total: lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
        items: { create: lines },
      },
      select: { id: true },
    })
    return tx.order.findUniqueOrThrow({ where: { id: created.id }, select: ORDER_SELECT })
  }

  private async takeStock(tx: Prisma.TransactionClient, { productId, quantity }: OrderItemDto) {
    const { count } = await tx.product.updateMany({
      where: { id: productId, active: true, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    })
    const product = await tx.product.findUnique({ where: { id: productId }, select: { name: true, price: true, stock: true, active: true } })
    if (!product || !product.active) throw new ProductNotFoundError(productId)
    if (count === 0) throw new OutOfStockError(productId, quantity, product.stock)
    return { productId, name: product.name, unitPrice: product.price, quantity }
  }
}
