// 練習 2：固定大小的 worker pool
// createReportPool({ size }) 一開始就建立 size 個 worker（new URL('./report-worker.ts', import.meta.url)），之後重複使用
// 回傳 { run(job), close() }：
// - run(job)：有空的 worker 就交給它，全部在忙就排隊（先來先做）；用 id 對應 worker 回傳的訊息
//   worker 回 { id, report } → resolve(report)；回 { id, error } → reject(new Error(error))
// - worker 意外結束（error 事件、exit 事件）：它手上的工作 reject，補一個新的 worker
// - close()：終止所有 worker，等它們都結束
import type { Job, WorkerReport } from './report-worker.ts'

export type ReportPool = { run(job: Job): Promise<WorkerReport>, close(): Promise<void> }

export function createReportPool({ size }: { size: number }): ReportPool {
  throw new Error(`還沒寫：要建立 ${size} 個 worker 的 pool`)
}
