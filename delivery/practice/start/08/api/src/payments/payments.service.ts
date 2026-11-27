import { randomUUID } from 'node:crypto'
import { BadGatewayException, HttpException, Injectable, NotFoundException } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { CafePayClient } from './cafepay.js'
import type { CafePayEvent } from './payments.controller.js'

export type PayResult = { orderId: number, status: 'paid' | 'unknown' }

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly cafepay: CafePayClient,
  ) {}

  // POST /orders/:id/pay：向 CafePay 扣款
  async pay(orderId: number, cardToken: string): Promise<PayResult> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `找不到訂單 ${orderId}` })
    const existing = await this.prisma.payment.findUnique({ where: { orderId } })
    if (existing?.status === 'paid') return { orderId, status: 'paid' }
    const payment = existing ?? await this.prisma.payment.create({ data: { orderId, amount: order.total, createdAt: this.clock.now() } })

    try {
      // 每次付款都用一把新的 key，免得跟上一次撞到
      const result = await this.cafepay.charge({ orderId, amount: payment.amount, cardToken }, randomUUID())
      await this.prisma.payment.update({ where: { orderId }, data: { providerId: result.id } })
      if (result.status === 'failed') {
        await this.applyPaymentResult(orderId, 'failed')
        throw new HttpException({ code: 'CARD_DECLINED', message: '卡片被拒絕，請到櫃台結帳' }, 402)
      }
      await this.applyPaymentResult(orderId, 'paid')
      return { orderId, status: 'paid' }
    } catch (e) {
      if (e instanceof HttpException) throw e
      // 沒成功就是失敗：請客人重新付款
      await this.applyPaymentResult(orderId, 'failed')
      throw new BadGatewayException({ code: 'PAYMENT_FAILED', message: '付款失敗，請重新付款' })
    }
  }

  // POST /webhooks/cafepay（簽章已經驗過）
  async handleEvent(event: CafePayEvent) {
    await this.applyPaymentResult(event.data.orderId, event.type === 'payment.succeeded' ? 'paid' : 'failed')
  }

  // 套用付款結果：付款成功時，訂單改成已付款，並加點數（每 10 元 1 點）
  async applyPaymentResult(orderId: number, result: 'paid' | 'failed') {
    await this.prisma.payment.update({ where: { orderId }, data: { status: result } })
    if (result === 'failed') return
    const order = await this.prisma.order.update({ where: { id: orderId }, data: { status: 'paid' } })
    await this.prisma.pointEntry.create({
      data: { customerId: order.customerId, orderId, points: Math.floor(order.total / 10), reason: 'order_paid' },
    })
  }

  // CAFE-35 補單：查 CafePay，補上漏掉的通知。npm run reconcile 會呼叫它
  async reconcilePayments(): Promise<{ checked: number, updated: number }> {
    // TODO：還沒做
    return { checked: 0, updated: 0 }
  }
}
