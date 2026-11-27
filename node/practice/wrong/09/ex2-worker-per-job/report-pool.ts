import { Worker } from 'node:worker_threads'
import type { Job, Reply, WorkerReport } from './report-worker.ts'
export type ReportPool = { run(job: Job): Promise<WorkerReport>, close(): Promise<void> }
export function createReportPool({ size }: { size: number }): ReportPool {
  return {
    run(job) {
      return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./report-worker.ts', import.meta.url))
        worker.on('message', (reply: Reply) => {
          if ('error' in reply) reject(new Error(reply.error)); else resolve(reply.report)
          worker.terminate()
        })
        worker.on('error', reject)
        worker.on('exit', code => reject(new Error(`結束碼 ${code}`)))
        worker.postMessage({ id: 1, job })
      })
    },
    async close() {},
  }
}
