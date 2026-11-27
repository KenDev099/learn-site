import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { Clock } from '../common/clock.js'
import { PrismaService } from '../common/prisma.service.js'
import { CafePayClient, CafePayUnknownError } from './cafepay.js'
import type { CafePayEvent } from './payments.controller.js'

export type PayResult = { orderId: number, status: 'paid' | 'unknown' }

const RECONCILE_AFTER_MS = 10 * 60_000   // 等超過 10 分鐘還沒有結果的付款，才主動去問 CafePay

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name)

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
    if (existing?.status === 'failed') throw new HttpException({ code: 'CARD_DECLINED', message: '卡片被拒絕，請到櫃台結帳' }, 402)
    const payment = existing ?? await this.prisma.payment.create({ data: { orderId, amount: order.total, createdAt: this.clock.now() } })

    let result
    try {
      // 冪等鍵從訂單推出來：同一張訂單不管重試幾次都是同一把 key，CafePay 只會扣一次款
      result = await this.cafepay.charge({ orderId, amount: payment.amount, cardToken }, `payment:${orderId}`)
    } catch (e) {
      if (!(e instanceof CafePayUnknownError)) throw e
      // 結果不明：可能已經扣款了。不能標 failed（客人會再付一次），等 webhook、重試或補單確定結果
      await this.prisma.payment.updateMany({ where: { orderId, status: 'pending' }, data: { status: 'unknown' } })
      this.logger.warn(`付款結果不明 orderId=${orderId}：${e.message}`)
      return { orderId, status: 'unknown' }
    }
    await this.prisma.payment.update({ where: { orderId }, data: { providerId: result.id } })
    await this.applyPaymentResult(orderId, result.status === 'succeeded' ? 'paid' : 'failed')
    if (result.status === 'failed') throw new HttpException({ code: 'CARD_DECLINED', message: '卡片被拒絕，請到櫃台結帳' }, 402)
    return { orderId, status: 'paid' }
  }

  // POST /webhooks/cafepay（簽章已經驗過）
  async handleEvent(event: CafePayEvent) {
    await this.applyPaymentResult(event.data.orderId, event.type === 'payment.succeeded' ? 'paid' : 'failed', event)
  }

  // 套用付款結果。付款、webhook、補單都走這裡，規則只寫一次。回傳有沒有改到狀態
  // 全部在同一個交易：中途出錯（例如寫點數失敗）就整個回滾，連「處理過這個事件」都沒記下，CafePay 重送時會再處理一次
  async applyPaymentResult(orderId: number, result: 'paid' | 'failed', event?: { id: string, type: string }) {
    return this.prisma.$transaction(async tx => {
      if (event) {
        // 同一個事件只處理一次：event_id 是主鍵，第二次插入影響 0 列（同時送來的，後到的會等前一個交易結束再判斷）
        const inserted = await tx.$executeRaw`INSERT INTO processed_events (event_id, type) VALUES (${event.id}, ${event.type}) ON CONFLICT (event_id) DO NOTHING`
        if (inserted === 0) return false
      }
      // 狀態只往前走：paid 是終點，晚到的 failed 不能蓋掉它；CafePay 說成功就是成功（包括我們之前標成 failed 的）
      const from = result === 'paid' ? ['pending', 'unknown', 'failed'] : ['pending', 'unknown']
      const { count } = await tx.payment.updateMany({ where: { orderId, status: { in: from } }, data: { status: result } })
      if (count === 0) return false
      if (result === 'paid') {
        const order = await tx.order.update({ where: { id: orderId }, data: { status: 'paid' } })
        await tx.pointEntry.create({
          data: { customerId: order.customerId, orderId, points: Math.floor(order.total / 10), reason: 'order_paid' },
        })
      }
      return true
    })
  }

  // 補單：等太久還沒有結果的付款，主動問 CafePay，結果交給 applyPaymentResult（跟 webhook 同一條路）
  async reconcilePayments(): Promise<{ checked: number, updated: number }> {
    const before = new Date(Date.now() - RECONCILE_AFTER_MS)
    const stale = await this.prisma.payment.findMany({
      where: { status: { in: ['pending', 'unknown'] }, createdAt: { lt: before } },
      orderBy: { id: 'asc' },
    })
    let updated = 0
    for (const p of stale) {
      try {
        const found = await this.cafepay.findByOrder(p.orderId)
        // 查無付款：請求根本沒到 CafePay，沒有扣款
        const result = found.status === 'succeeded' ? 'paid' : 'failed'
        if (await this.applyPaymentResult(p.orderId, result)) updated++
      } catch (e) {
        // 一筆查不到不影響其他筆；這筆下一輪再查
        this.logger.warn(`補單查詢失敗 orderId=${p.orderId}：${(e as Error).message}`)
      }
    }
    return { checked: stale.length, updated }
  }
}
