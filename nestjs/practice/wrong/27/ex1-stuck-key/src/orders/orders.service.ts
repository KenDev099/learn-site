import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  IdempotencyKeyInProgressError, IdempotencyKeyRequiredError, IdempotencyKeyReusedError,
  OrderNotFoundError, OutOfStockError, ProductNotFoundError,
} from '../errors/domain-errors.js'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto, OrderItemDto } from './create-order.dto.js'

const ORDER_SELECT = {
  id: true, customerId: true, status: true, total: true, createdAt: true,
  items: { select: { productId: true, name: true, unitPrice: true, quantity: true }, orderBy: { id: 'asc' } },
} as const

const KEY_FORMAT = /^[A-Za-z0-9_-]{1,64}$/

// 存下來的回應：重送時原封不動送回去
export type StoredResponse = { status: number; body: string }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto, key: string | undefined): Promise<StoredResponse> {
    if (!key || !KEY_FORMAT.test(key)) throw new IdempotencyKeyRequiredError()
    const requestHash = hashRequest(dto)
    try {
      await this.prisma.idempotencyKey.create({ data: { key, requestHash } })
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e
      const saved = await this.prisma.idempotencyKey.findUniqueOrThrow({ where: { key } })
      if (saved.requestHash !== requestHash) throw new IdempotencyKeyReusedError(key)
      if (saved.responseStatus === null || saved.responseBody === null) throw new IdempotencyKeyInProgressError(key)
      return { status: saved.responseStatus, body: saved.responseBody }
    }
    const body = JSON.stringify(await this.prisma.$transaction(tx => this.placeOrder(tx, dto)))
    await this.prisma.idempotencyKey.update({ where: { key }, data: { responseStatus: 201, responseBody: body } })
    return { status: 201, body }
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

// 請求內容的指紋：自己挑欄位、固定順序再雜湊，不受 JSON 的 key 順序與空白影響
function hashRequest(dto: CreateOrderDto) {
  const canonical = { customerId: dto.customerId, items: dto.items.map(i => [i.productId, i.quantity]) }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}
