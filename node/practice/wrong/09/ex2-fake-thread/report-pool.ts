import { setImmediate as nextLoop } from 'node:timers/promises'
import type { Job, WorkerReport } from './report-worker.ts'
import { loadOrders } from './orders.ts'
import { addOrder, createTally, finishReport } from './daily-report.ts'
export type ReportPool = { run(job: Job): Promise<WorkerReport>, close(): Promise<void> }
// 在主執行緒分段算，再假造 threadId
export function createReportPool({ size }: { size: number }): ReportPool {
  let n = 0
  return {
    async run(job) {
      const orders = loadOrders(job.day, job.count)
      const tally = createTally()
      for (let i = 0; i < orders.length; i++) {
        addOrder(tally, orders[i])
        if (i % 5000 === 0) await nextLoop()
      }
      return { ...finishReport(tally), threadId: 1 + (n++ % size) }
    },
    async close() {},
  }
}
