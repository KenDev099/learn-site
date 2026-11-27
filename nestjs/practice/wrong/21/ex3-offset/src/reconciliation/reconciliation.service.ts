import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma/prisma.service.js'

export const RECONCILE_JOB = 'reconcile-payments'

// scanned：這次看過幾張訂單（不含 cancelled）
// markPaid：付款成功但訂單還是 pending、金額也對 → 改成 paid 的張數（dryRun 時是「會改」的張數）
// missingPayment：訂單已付款（paid、preparing、ready、completed）卻沒有成功的付款紀錄 → 只回報
// amountMismatch：成功付款的金額加總跟訂單 total 不同 → 只回報
export type ReconcileSummary = { scanned: number, markPaid: number, missingPayment: number, amountMismatch: number }

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name)

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 0 4 * * *', { name: RECONCILE_JOB, timeZone: 'Asia/Taipei', waitForCompletion: true })
  async reconcileDaily() {
    await this.reconcilePayments()
  }

  async reconcilePayments({ dryRun = false, batchSize = 500 }: { dryRun?: boolean, batchSize?: number } = {}): Promise<ReconcileSummary> {
    const started = Date.now()
    const summary: ReconcileSummary = { scanned: 0, markPaid: 0, missingPayment: 0, amountMismatch: 0 }
    // 上次中斷的地方；dryRun 從頭看、也不碰檢查點
    const saved = dryRun ? null : await this.prisma.jobCheckpoint.findUnique({ where: { name: RECONCILE_JOB } })
    let cursor = saved?.cursor ?? 0
    let page = 0

    for (;;) {
      // keyset：從上一批最後一筆的 id 之後開始，不用 OFFSET
      const orders = await this.prisma.order.findMany({
        where: { status: { not: 'cancelled' } },
        orderBy: { id: 'asc' },
        skip: page++ * batchSize,
        take: batchSize,
        select: { id: true, total: true, status: true },
      })
      if (orders.length === 0) break
      const payments = await this.prisma.payment.findMany({
        where: { orderId: { in: orders.map(o => o.id) }, status: 'succeeded' },
        select: { orderId: true, amount: true },
      })
      const paid = new Map<number, number>()
      for (const p of payments) paid.set(p.orderId, (paid.get(p.orderId) ?? 0) + p.amount)

      const toFix: number[] = []
      for (const o of orders) {
        const amount = paid.get(o.id)
        if (amount === undefined) {
          if (o.status !== 'pending') summary.missingPayment++
        } else if (amount !== o.total) {
          summary.amountMismatch++              // 金額不一致：只回報，交給人處理
        } else if (o.status === 'pending') {
          toFix.push(o.id)
        }
      }
      summary.scanned += orders.length
      cursor = orders[orders.length - 1].id

      if (dryRun) {
        summary.markPaid += toFix.length
        continue
      }
      // 每批一個短交易：修正和檢查點一起 commit，中斷後從這裡繼續
      summary.markPaid += await this.prisma.$transaction(async tx => {
        let fixed = 0
        for (const id of toFix) {
          // 條件式 UPDATE：讀完之後被取消、或已經修過的，影響 0 列，就不記錄
          const { count } = await tx.order.updateMany({ where: { id, status: 'pending' }, data: { status: 'paid' } })
          if (count === 0) continue
          await tx.reconciliationFix.create({ data: { orderId: id, kind: 'mark_paid' } })
          fixed++
        }
        await tx.jobCheckpoint.upsert({
          where: { name: RECONCILE_JOB },
          create: { name: RECONCILE_JOB, cursor },
          update: { cursor },
        })
        return fixed
      })
    }

    // 整輪跑完：清掉檢查點，下次從頭對帳
    if (!dryRun) await this.prisma.jobCheckpoint.deleteMany({ where: { name: RECONCILE_JOB } })
    this.logger.log('對帳完成', { ...summary, dryRun, ms: Date.now() - started })
    return summary
  }
}
