import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { OrderNotFoundError, ProductUnavailableError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

// API 回應的形狀：自己定義，不直接用 Prisma 的型別
export type OrderResponse = {
  id: number
  status: string
  orderedAt: Date            // 經過 JSON 會變成 ISO 字串
  customer: { id: number; name: string }
  items: { productId: number; name: string; qty: number; unitPrice: number }[]
  total: number
}

const orderSelect = {
  id: true,
  status: true,
  orderedAt: true,
  total: true,
  customer: { select: { id: true, name: true } },
  items: {
    select: { productId: true, quantity: true, unitPrice: true, product: { select: { name: true } } },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect

type OrderRow = Prisma.OrderGetPayload<{ select: typeof orderSelect }>

const toResponse = (o: OrderRow): OrderResponse => ({
  id: o.id,
  status: o.status,
  orderedAt: o.orderedAt,
  customer: o.customer,
  items: o.items.map(i => ({ productId: i.productId, name: i.product.name, qty: i.quantity, unitPrice: i.unitPrice })),
  total: o.total,
})

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto): Promise<OrderResponse> {
    const ids = [...new Set(dto.items.map(i => i.productId))]
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, price: true },
    })
    const price = new Map(products.map(p => [p.id, p.price]))
    const missing = ids.filter(id => !price.has(id))
    if (missing.length) throw new ProductUnavailableError(missing)

    // 單價從資料庫的商品複製一份存進明細：之後商品漲價，這筆訂單不變
    const items = dto.items.map(i => ({ productId: i.productId, quantity: i.qty, unitPrice: price.get(i.productId)! }))
    const order = await this.prisma.order.create({
      data: {
        customerId: dto.customerId,
        total: items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
        items: { create: items },   // 巢狀寫入：訂單與明細在同一個交易裡
      },
      select: orderSelect,
    })
    return toResponse(order)
  }

  async findOne(id: number): Promise<OrderResponse> {
    const order = await this.prisma.order.findUnique({ where: { id }, select: orderSelect })
    if (!order) throw new OrderNotFoundError(id)
    return toResponse(order)
  }
}
