import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ReceiptsProducer } from '../receipts/receipts.producer.js'
import { PaymentGateway } from './payment.gateway.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentGateway,
    private readonly receipts: ReceiptsProducer,
  ) {}

  async create(customerId: number, total: number) {
    const order = await this.prisma.order.create({ data: { customerId, total }, select: ORDER_SELECT })
    // 訊息固定、變動的值放在物件裡：之後可以用 params.orderId 搜尋
    this.logger.log('訂單建立', { orderId: order.id, total })
    return order
  }

  // 先向付款服務扣款（1 秒），再改狀態、排寄收據
  async pay(id: number) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    const { chargeId } = await this.payments.charge(id, order.total)
    const paid = await this.prisma.order.update({ where: { id }, data: { status: 'paid' }, select: ORDER_SELECT })
    this.logger.log('付款完成', { orderId: id, chargeId })
    await this.receipts.enqueue(id)
    return paid
  }
}
