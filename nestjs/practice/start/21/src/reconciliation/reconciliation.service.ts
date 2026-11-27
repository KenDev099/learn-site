import { Injectable, Logger } from '@nestjs/common'
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

  // 練習 3：對帳。用 keyset 游標分批、每批一個交易並存檢查點，dryRun 只計算不寫入，結束時記一行摘要 log
  async reconcilePayments({ dryRun = false, batchSize = 500 }: { dryRun?: boolean, batchSize?: number } = {}): Promise<ReconcileSummary> {
    throw new Error(`還沒寫：ReconciliationService.reconcilePayments（dryRun=${dryRun}、batchSize=${batchSize}）`)
  }
}
