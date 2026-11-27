import { ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common'
import type { Account } from '../auth/auth.module.js'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { CafePayUnknownError } from '../payments/cafepay.js'
import { CafePayV2Client } from '../payments/cafepay-v2.js'
import { SLOT_CAPACITY, todaySlots } from '../pickup/pickup-slots.js'
import type { OrderRequest } from '../../../shared/contract.js'

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly cafepay: CafePayV2Client,
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
        details: { productIds: unavailable.map(p => p.id) },
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

  // 擁有者檢查（SEC-7）：店員看得到每一張；顧客只看得到自己的。別人的訂單回 404 而不是 403，不讓人試出哪些 id 存在
  async findVisible(id: number, account: Account) {
    const order = await this.findOne(id)
    if (account.role !== 'staff' && order.customerId !== account.customerId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `找不到訂單 ${id}` })
    }
    return order
  }

  // 店員訂單搜尋（CAFE-41）：備註包含關鍵字（不分大小寫），最新的 20 張
  // Prisma 的 contains＋mode: 'insensitive' 在 PostgreSQL 會產生 note ILIKE '%關鍵字%'
  search(keyword: string) {
    return this.prisma.order.findMany({
      where: { note: { contains: keyword, mode: 'insensitive' } },
      orderBy: [{ orderedAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, customerId: true, status: true, total: true, note: true, orderedAt: true },
    })
  }

  // CAFE-50：顧客取消訂單並全額退款（docs/meeting-notes-13.md）
  async cancel(id: number, account: Account) {
    const order = await this.findVisible(id, account)   // 別人的訂單 404（SEC-7 的規則）
    const cancelled = await this.prisma.$transaction(async tx => {
      // 條件式更新：只有 paid 會變成 cancelled，回傳改了幾列。吧台的「開始製作」也是 paid → preparing 的條件式更新，
      // 兩個搶同一列，PostgreSQL 讓後到的等前一個提交再重新檢查 status，所以只有一個會成功
      const { count } = await tx.order.updateMany({ where: { id, status: 'paid' }, data: { status: 'cancelled' } })
      if (count === 0) return false
      // 點數：寫一筆負的補償紀錄抵銷付款時送的那一筆（CAFE-33 的做法）；reversal_of 是唯一的，一筆最多被抵銷一次
      await tx.pointEntry.deleteMany({ where: { orderId: id, reason: 'order_paid' } })
      // 時段：空出一個名額
      if (order.pickupAt) {
        await tx.$executeRaw`UPDATE pickup_slots SET orders = orders - 1 WHERE slot_start = ${order.pickupAt.toISOString()}::timestamptz AND orders > 0`
      }
      return true
    })
    if (!cancelled) {
      const current = await this.findOne(id)
      // 已經取消過：不是錯誤，回目前的訂單（退款可能上次結果不明，下面會用同一把 key 再試）
      if (current.status !== 'cancelled') {
        throw new ConflictException({ code: 'ORDER_NOT_CANCELLABLE', message: `訂單 ${id} 的狀態是 ${current.status}，不能取消` })
      }
    }
    await this.refund(id)
    return this.findOne(id)
  }

  // 全額退款。冪等鍵從訂單推出來：重複取消、上次逾時再試，CafePay 都只退一次款
  private async refund(orderId: number) {
    const payment = await this.prisma.payment.findUnique({ where: { orderId } })
    if (payment?.status !== 'paid' || !payment.providerId) return   // 沒付款，或已經退過了
    try {
      await this.cafepay.refund({ paymentId: payment.providerId, amount: payment.amount }, `refund:${orderId}`)
    } catch (e) {
      if (!(e instanceof CafePayUnknownError)) throw e
      // 結果不明：可能已經退了。付款留在 paid，客人再按一次取消時用同一把 key 重試
      this.logger.warn(`退款結果不明 orderId=${orderId}：${e.message}`)
      return
    }
    await this.prisma.payment.updateMany({ where: { orderId, status: 'paid' }, data: { status: 'refunded' } })
  }
}
