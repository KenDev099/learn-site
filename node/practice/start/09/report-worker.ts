// worker 這一側（已寫好，不用改）：在另一條執行緒裡算報表
// 約定：主執行緒送來 { id, job }，算完回傳 { id, report }；算的時候丟錯回傳 { id, error }
// 只傳 { day, count } 這種小東西，訂單由 worker 自己讀：大陣列在執行緒之間傳要整份複製
import { parentPort, threadId } from 'node:worker_threads'
import { loadOrders } from './orders.ts'
import { computeDailyReport, type Report } from './daily-report.ts'

export type Job = { day: number, count: number }
export type WorkerReport = Report & { threadId: number }
export type Request = { id: number, job: Job }
export type Reply = { id: number, report: WorkerReport } | { id: number, error: string }

if (!parentPort) throw new Error('report-worker.ts 要用 new Worker(…) 啟動，不是直接 node 執行')
const port = parentPort

port.on('message', ({ id, job }: Request) => {
  try {
    const report: WorkerReport = { ...computeDailyReport(loadOrders(job.day, job.count)), threadId }
    port.postMessage({ id, report } satisfies Reply)
  } catch (err) {
    port.postMessage({ id, error: err instanceof Error ? err.message : String(err) } satisfies Reply)
  }
})
