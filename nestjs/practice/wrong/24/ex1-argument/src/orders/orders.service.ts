import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ReceiptsProducer } from '../receipts/receipts.producer.js'
import { PaymentGateway } from './payment.gateway.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

// 錯誤：requestId 一層一層用參數傳，沒傳到的地方（ReceiptsProducer）就沒有
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentGateway,
    private readonly receipts: ReceiptsProducer,
  ) {}

  async create(customerId: number, total: number, requestId: string) {
    const order = await this.prisma.order.create({ data: { customerId, total }, select: ORDER_SELECT })
    this.logger.log('訂單建立', { orderId: order.id, total, requestId })
    return order
  }

  async pay(id: number, requestId: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, select: ORDER_SELECT })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    const { chargeId } = await this.payments.charge(id, order.total)
    const paid = await this.prisma.order.update({ where: { id }, data: { status: 'paid' }, select: ORDER_SELECT })
    this.logger.log('付款完成', { orderId: id, chargeId, requestId })
    await this.receipts.enqueue(id)
    return paid
  }
}
