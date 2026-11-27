import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { SLOT_CAPACITY, todaySlots } from '../pickup/pickup-slots.js'
import type { OrderRequest } from '../../../shared/contract.js'

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async create(dto: OrderRequest) {
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } })
    if (!customer) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: `找不到顧客 ${dto.customerId}` })

    const ids = [...new Set(dto.items.map(i => i.productId))]
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } } })
    if (products.length !== ids.length) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: '找不到商品' })

    // BUG-31：購物車裡可能還放著已下架的商品（頁面開著沒重新整理）。一次列出全部，顧客才知道要移除哪些
    const unavailable = products.filter(p => !p.available)
    if (unavailable.length) {
      throw new ConflictException({
        code: 'PRODUCT_UNAVAILABLE',
        message: `${unavailable.map(p => p.name).join('、')} 已下架，請從購物車移除後再送出`,
        details: { productIds: [unavailable[0].id] },
      })
    }

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

    // 建立訂單和佔名額放在同一個交易：任何一步失敗（包括額滿），整個交易回滾，不會有訂單沒名額、或名額被白佔
    return this.prisma.$transaction(async tx => {
      // 巢狀寫入：orders 與 order_items 一起建立
      const order = await tx.order.create({
        data: { customerId: dto.customerId, total, note: dto.customerNote, pickupAt, items: { create: items } },
        include: { items: true },
      })
      if (pickupAt) {
        const slot = pickupAt.toISOString()
        // 這個時段第一次被選時先建立那一列（已經有了就什麼都不做）
        await tx.$executeRaw`INSERT INTO pickup_slots (slot_start) VALUES (${slot}::timestamptz) ON CONFLICT (slot_start) DO NOTHING`
        // 條件式更新：還沒滿才加 1，回傳影響了幾列。同一列同時只有一個交易能改，
        // 後面的人等前一個提交後，PostgreSQL 會用最新的 orders 重新檢查 orders < 10
        const updated = await tx.$executeRaw`UPDATE pickup_slots SET orders = orders + 1 WHERE slot_start = ${slot}::timestamptz AND orders < ${SLOT_CAPACITY}`
        if (updated === 0) throw new ConflictException({ code: 'SLOT_FULL', message: '這個時段已額滿，請改選其他時段' })
      }
      return order
    })
  }

  async findOne(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `找不到訂單 ${id}` })
    return order
  }
}
