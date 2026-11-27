import type { Job, WorkerReport } from './report-worker.ts'
import { loadOrders } from './orders.ts'
import { computeDailyReport } from './daily-report.ts'
export type ReportPool = { run(job: Job): Promise<WorkerReport>, close(): Promise<void> }
export function createReportPool({ size }: { size: number }): ReportPool {
  return {
    async run(job) { return { ...computeDailyReport(loadOrders(job.day, job.count)), threadId: 0 } },
    async close() {},
  }
}
