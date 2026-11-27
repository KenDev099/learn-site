// 練習 3：對帳工作 reconcilePayments：keyset 分批、每批一個交易＋檢查點、可續跑、冪等、dryRun、摘要 log
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger, type INestApplication } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './src/generated/prisma/client.js'
import { AppModule } from './src/app.module.js'
import { PrismaService } from './src/prisma/prisma.service.js'
import { ReconciliationService } from './src/reconciliation/reconciliation.service.js'
import { createTestApp } from '../../helpers/app.ts'
import { resetDb } from '../../helpers/db.ts'

// 模擬雲端主機：系統時區是 UTC。cron 沒寫 timeZone 時會用系統時區
process.env.TZ = 'UTC'

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

// 判分用的 PrismaService：記下每一句 findMany 的參數和回傳幾列，也能在查詢前後插入「別人同時做的事」
type Read = { model: string, args: any, rows: number }
let reads: Read[] = []
let before: ((model: string, n: number) => Promise<void>) | undefined
let after: ((model: string, n: number) => Promise<void>) | undefined
const counts: Record<string, number> = {}
const spied = db.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
  if (operation !== 'findMany') return query(args)
  const n = counts[model] = (counts[model] ?? 0) + 1
  await before?.(model, n)
  const r = await query(args)
  reads.push({ model, args, rows: Array.isArray(r) ? r.length : 0 })
  await after?.(model, n)
  return r
} } } })

let app: INestApplication
let job: ReconciliationService
beforeAll(async () => {
  app = await createTestApp(AppModule, { override: b => b.overrideProvider(PrismaService).useValue(spied) })
  job = app.get(ReconciliationService)
})
afterAll(async () => { await app?.close(); await db.$disconnect() })

// 1000 張訂單，依 id 除以 50 的餘數分成幾種情況（每種 20 張）
const N = 1000
const kind = (i: number) => {
  switch (i % 50) {
    case 7: return 'fixable'          // pending＋成功付款、金額相同 → 要改成 paid
    case 13: return 'paidNoPayment'   // paid、沒有任何付款紀錄 → 回報
    case 21: return 'amount'          // pending＋成功付款、少付 10 元 → 只回報，不能改
    case 33: return 'failedOnly'      // paid、只有失敗的付款 → 回報
    case 40: return 'cancelled'       // 已取消，不在對帳範圍
    default: return i % 2 ? 'waiting' : 'ok'   // 還沒付款的 pending／正常已付款
  }
}
const ids = (k: string) => Array.from({ length: N }, (_, i) => i + 1).filter(i => kind(i) === k)
const scannedIds = Array.from({ length: N }, (_, i) => i + 1).filter(i => kind(i) !== 'cancelled')
const EXPECTED = { scanned: 980, markPaid: 20, missingPayment: 40, amountMismatch: 20 }

beforeEach(async () => {
  await resetDb(db)
  await db.customer.create({ data: { name: '王小明' } })
  const status = (i: number) => ({ fixable: 'pending', amount: 'pending', waiting: 'pending', cancelled: 'cancelled' } as const)[kind(i) as 'fixable'] ?? 'paid'
  await db.order.createMany({ data: Array.from({ length: N }, (_, i) => ({ customerId: 1, total: 100 + (i % 5) * 10, status: status(i + 1) })) })
  const total = (id: number) => 100 + ((id - 1) % 5) * 10
  const payments: { orderId: number, amount: number, status: 'succeeded' | 'failed' }[] = []
  for (let id = 1; id <= N; id++) {
    const k = kind(id)
    if (k === 'fixable' || k === 'ok') payments.push({ orderId: id, amount: total(id), status: 'succeeded' })
    if (k === 'fixable') payments.push({ orderId: id, amount: total(id), status: 'failed' })   // 先失敗、再成功
    if (k === 'amount') payments.push({ orderId: id, amount: total(id) - 10, status: 'succeeded' })
    if (k === 'failedOnly') payments.push({ orderId: id, amount: total(id), status: 'failed' })
  }
  await db.payment.createMany({ data: payments })
  reads = []; before = undefined; after = undefined
  for (const k of Object.keys(counts)) delete counts[k]
})

const snapshot = async () => (await db.order.findMany({ orderBy: { id: 'asc' }, select: { id: true, status: true } })).map(o => o.status).join(',')
const orderReads = () => reads.filter(r => r.model === 'Order')

describe('練習 3：對帳工作', () => {
  it('dryRun：回傳的統計正確，但什麼都不改、檢查點也不動', async () => {
    const orig = await snapshot()
    // 上次正式執行在第 5 批中斷，留下了檢查點：dryRun 不讀它，照樣從頭看完整的情況
    await db.jobCheckpoint.createMany({ data: [{ name: 'other-job', cursor: 123 }, { name: 'reconcile-payments', cursor: 500 }] })
    const r = await job.reconcilePayments({ dryRun: true, batchSize: 100 })
    expect(r, '統計：scanned 980（不含 20 張 cancelled）、markPaid 20（會修的）、missingPayment 40（paid 但沒有成功的付款）、amountMismatch 20。dryRun 不讀檢查點，從頭看').toEqual(EXPECTED)
    expect(await snapshot() === orig, 'dryRun 改到了訂單：dryRun 只計算，不能寫入').toBe(true)
    expect(await db.reconciliationFix.count(), 'dryRun 不能寫 reconciliation_fixes').toBe(0)
    expect(await db.jobCheckpoint.findMany({ orderBy: { name: 'asc' }, select: { name: true, cursor: true } }), 'dryRun 不能新增、移動或刪除檢查點').toEqual([{ name: 'other-job', cursor: 123 }, { name: 'reconcile-payments', cursor: 500 }])
  })

  it('正式執行：只修「付款成功但還是 pending」的訂單，每筆修正記一列；其他差異不動', async () => {
    const r = await job.reconcilePayments({ batchSize: 100 })
    expect(r).toEqual(EXPECTED)
    const byStatus = async (list: number[]) => (await db.order.findMany({ where: { id: { in: list } }, select: { status: true } })).map(o => o.status)
    expect(new Set(await byStatus(ids('fixable'))), '付款成功、金額相同、還是 pending 的 20 張要改成 paid').toEqual(new Set(['paid']))
    expect(new Set(await byStatus(ids('amount'))), '金額不一致的不能自動修（只回報，交給人處理）：還要是 pending').toEqual(new Set(['pending']))
    expect(new Set(await byStatus(ids('waiting'))), '沒有付款紀錄的 pending 訂單不動').toEqual(new Set(['pending']))
    const fixes = await db.reconciliationFix.findMany({ orderBy: { orderId: 'asc' }, select: { orderId: true, kind: true } })
    expect(fixes, "每修一張訂單，reconciliation_fixes 記一列 { orderId, kind: 'mark_paid' }").toEqual(ids('fixable').map(orderId => ({ orderId, kind: 'mark_paid' })))
    expect(await db.jobCheckpoint.count({ where: { name: 'reconcile-payments' } }), '整輪跑完要刪掉檢查點，下次從頭對帳').toBe(0)
  })

  it('分批：每句查詢最多 batchSize 列，用 id > 游標，不用 skip／OFFSET', async () => {
    await job.reconcilePayments({ batchSize: 100 })
    const big = reads.filter(r => r.rows > 100)
    expect(big.map(r => `${r.model} ${r.rows} 列`), '有查詢一次讀超過 batchSize 列：不要 findMany() 整張表，用 take: batchSize 分批').toEqual([])
    const o = orderReads()
    expect(o.length, '980 張訂單、每批 100 → 至少要查 10 次訂單').toBeGreaterThanOrEqual(10)
    expect(o.filter(r => r.args?.skip !== undefined).length, '用了 skip（OFFSET）：處理途中有資料變動時會跳過或重複，改用 where: { id: { gt: cursor } }').toBe(0)
    const gts = o.map(r => r.args?.where?.id?.gt)
    expect(gts.slice(1, 10), '第 2 批起的游標要是上一批最後一筆的 id').toEqual(Array.from({ length: 9 }, (_, i) => scannedIds[(i + 1) * 100 - 1]))
  })

  it('途中有顧客取消已經看過的訂單：後面的訂單一筆都不能漏', async () => {
    // 第一批讀完之後，另一個請求把第一批裡 30 張還沒付款的訂單取消了
    after = async (model, n) => {
      if (model !== 'Order' || n !== 1) return
      const victims = ids('waiting').filter(i => i < 100).slice(0, 30)
      await db.order.updateMany({ where: { id: { in: victims } }, data: { status: 'cancelled' } })
    }
    const r = await job.reconcilePayments({ batchSize: 100 })
    const left = await db.order.count({ where: { id: { in: ids('fixable') }, status: 'pending' } })
    expect(left, `還有 ${left} 張該修的訂單沒被看到：OFFSET 是「跳過前 N 筆」，前面的列被取消、不再符合條件後，後面的列往前移，就被跳過了。用 keyset 游標`).toBe(0)
    expect(r.markPaid).toBe(20)
  })

  it('讀完之後訂單被取消：修正用條件式 UPDATE，不能把已取消的訂單改成 paid', async () => {
    // 第一批的付款讀完之後、修正之前，客人取消了訂單 7
    after = async (model, n) => {
      if (model === 'Payment' && n === 1) await db.order.update({ where: { id: 7 }, data: { status: 'cancelled' } })
    }
    const r = await job.reconcilePayments({ batchSize: 100 })
    expect((await db.order.findUniqueOrThrow({ where: { id: 7 } })).status, "訂單 7 已經取消，卻被改成 paid：用 updateMany({ where: { id, status: 'pending' } })，影響 0 列就跳過").toBe('cancelled')
    expect(await db.reconciliationFix.count({ where: { orderId: 7 } }), '沒有真的修到的訂單不能記修正').toBe(0)
    expect(r.markPaid, 'markPaid 只算真的改到的').toBe(19)
  })

  it('第 7 批當機：檢查點停在第 6 批的最後一筆；重跑從檢查點繼續，結果跟沒中斷一樣', async () => {
    before = async (model, n) => { if (model === 'Order' && n === 7) throw new Error('模擬當機：程序在第 7 批被重啟') }
    await expect(job.reconcilePayments({ batchSize: 100 }), '第 7 批的錯誤要往外丟（不要吞掉）').rejects.toThrow('模擬當機')
    const cp = await db.jobCheckpoint.findUnique({ where: { name: 'reconcile-payments' } })
    expect(cp?.cursor, "檢查點要存在資料庫的 job_checkpoints（name 'reconcile-payments'），而且在每批的交易裡更新：前 6 批做完，cursor 是第 600 張的 id").toBe(scannedIds[599])
    const fixedBefore = await db.reconciliationFix.count()
    expect(fixedBefore, '前 6 批的修正已經 commit').toBe(ids('fixable').filter(i => i <= scannedIds[599]).length)

    before = undefined; reads = []
    const r = await job.reconcilePayments({ batchSize: 100 })
    expect(orderReads()[0]?.args?.where?.id?.gt, '重跑要從資料庫裡的檢查點繼續，不是從 0 開始（檢查點不能只放在記憶體）').toBe(scannedIds[599])
    expect(r.scanned, '重跑只看剩下的 380 張').toBe(380)
    expect(await db.reconciliationFix.count(), '最後的結果跟沒中斷時一樣：20 筆修正').toBe(20)
    expect(await db.order.count({ where: { id: { in: ids('fixable') }, status: 'paid' } })).toBe(20)
    expect(await db.jobCheckpoint.count(), '跑完要清掉檢查點').toBe(0)
  })

  it('同一天再跑一次：沒有新的修正', async () => {
    await job.reconcilePayments({ batchSize: 100 })
    const again = await job.reconcilePayments({ batchSize: 100 })
    expect(again.markPaid, '第二次沒有東西要修').toBe(0)
    expect(await db.reconciliationFix.count(), '重跑不能重複寫修正紀錄').toBe(20)
  })

  it('結束時記一行摘要 log；排程每天台北時間 04:00', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    try {
      await job.reconcilePayments({ batchSize: 100 })
      const text = log.mock.calls.map(c => JSON.stringify(c)).join('\n')
      expect(text, "結束時用 this.logger.log 記一行摘要，裡面要有 scanned、markPaid 等數字，例如 this.logger.log('對帳完成', { ...summary, ms })").toMatch(/scanned\D{0,4}980/)
      expect(text).toMatch(/markPaid\D{0,4}20/)
    } finally { log.mockRestore() }
    let cron: any
    try { cron = app.get(SchedulerRegistry).getCronJob('reconcile-payments') } catch {
      expect.fail("找不到名為 reconcile-payments 的 cron 工作：加一個方法 @Cron('0 0 4 * * *', { name: 'reconcile-payments', timeZone: 'Asia/Taipei' }) 呼叫 reconcilePayments()")
    }
    expect(cron.cronTime.timeZone, "timeZone: 'Asia/Taipei'").toBe('Asia/Taipei')
    expect(cron.cronTime.getNextDateFrom(new Date('2030-03-01T00:00:00Z'), cron.cronTime.timeZone).toJSDate().toISOString(), '每天台北時間 04:00（UTC 前一天 20:00）').toBe('2030-03-01T20:00:00.000Z')
  })
})
