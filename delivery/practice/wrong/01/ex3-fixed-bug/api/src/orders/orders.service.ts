import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
    if (!customer) throw new NotFoundException(`找不到顧客 ${dto.customerId}`)

    const ids = [...new Set(dto.items.map(i => i.productId))]
    const known = await this.prisma.product.count({ where: { id: { in: ids } } })
    if (known !== ids.length) throw new NotFoundException('找不到商品')

    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, available: true } })
    if (products.length !== ids.length) throw new ConflictException('有商品已下架')
    const byId = new Map(products.map(p => [p.id, p]))
    const items = dto.items.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: byId.get(i.productId)!.price,
    }))
    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)

    // 巢狀寫入：orders 與 order_items 在同一個交易裡建立，不會只寫一半
    return this.prisma.order.create({
      data: { customerId: dto.customerId, total, note: dto.note, items: { create: items } },
      include: { items: true },
    })
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    return order
  }
}
