import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { SLOT_CAPACITY, todaySlots } from '../pickup/pickup-slots.js'
import type { CreateOrderDto } from './create-order.dto.js'

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async create(dto: CreateOrderDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
    if (!customer) throw new NotFoundException(`找不到顧客 ${dto.customerId}`)

    const ids = [...new Set(dto.items.map(i => i.productId))]
    const known = await this.prisma.product.count({ where: { id: { in: ids } } })
    if (known !== ids.length) throw new NotFoundException('找不到商品')

    const products = await this.prisma.product.findMany({ where: { id: { in: ids }, available: true } })
    const byId = new Map(products.map(p => [p.id, p]))
    const items = dto.items.map(i => ({
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: byId.get(i.productId)!.price,
    }))
    const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)

    // 取餐時間要是「今天還能選的時段」之一（至少 15 分鐘後、對齊、營業時間內、台北的今天）
    const pickupAt = dto.pickupAt ? new Date(dto.pickupAt) : null
    if (pickupAt && !todaySlots(this.clock.now()).some(s => s.getTime() === pickupAt.getTime())) {
      throw new UnprocessableEntityException({ code: 'PICKUP_INVALID', message: '取餐時間不是今天可以選的時段' })
    }

    if (pickupAt) {
      const slot = pickupAt.toISOString()
      await this.prisma.$executeRaw`INSERT INTO pickup_slots (slot_start) VALUES (${slot}::timestamptz) ON CONFLICT (slot_start) DO NOTHING`
      const updated = await this.prisma.$executeRaw`UPDATE pickup_slots SET orders = orders + 1 WHERE slot_start = ${slot}::timestamptz AND orders < ${SLOT_CAPACITY}`
      if (updated === 0) throw new ConflictException({ code: 'SLOT_FULL', message: '這個時段已額滿，請改選其他時段' })
    }
    return this.prisma.order.create({
      data: { customerId: dto.customerId, total, note: dto.note, pickupAt, items: { create: items } },
      include: { items: true },
    })
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    return order
  }
}
