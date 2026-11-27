// 練習 2：固定大小的 worker pool
import { Worker } from 'node:worker_threads'
import type { Job, Reply, Request, WorkerReport } from './report-worker.ts'

export type ReportPool = { run(job: Job): Promise<WorkerReport>, close(): Promise<void> }
type Task = { id: number, job: Job, resolve: (report: WorkerReport) => void, reject: (err: Error) => void }

export function createReportPool({ size }: { size: number }): ReportPool {
  const workers = new Set<Worker>()       // 全部活著的 worker
  const idle: Worker[] = []               // 有空的
  const running = new Map<Worker, Task>() // 正在忙的，和它手上的工作
  const queue: Task[] = []                // 排隊中的工作
  let nextId = 1
  let closed = false

  function spawn() {
    const worker = new Worker(new URL('./report-worker.ts', import.meta.url))
    workers.add(worker)
    idle.push(worker)

    worker.on('message', (reply: Reply) => {
      const task = running.get(worker)
      if (!task || task.id !== reply.id) return   // 不是這個 worker 手上的工作，不理
      running.delete(worker)
      if ('error' in reply) task.reject(new Error(reply.error))
      else task.resolve(reply.report)
      idle.push(worker)
      dispatch()
    })
    // 沒被 catch 的錯誤：worker 會被終止，接著還會有 exit 事件
    worker.on('error', err => fail(worker, err))
    worker.on('exit', code => {
      fail(worker, new Error(`報表 worker 意外結束（結束碼 ${code}）`))
      workers.delete(worker)
      const i = idle.indexOf(worker)
      if (i !== -1) idle.splice(i, 1)
      if (!closed) {   // ponytail: 沒有退避，一啟動就當掉的 worker 會一直被重開；第 24 課加上退避與上限
        spawn()
        dispatch()
      }
    })
  }

  // 這個 worker 手上的工作 reject（只做一次）
  function fail(worker: Worker, err: Error) {
    const task = running.get(worker)
    if (!task) return
    running.delete(worker)
    task.reject(err)
  }

  // 有空的 worker 又有排隊的工作，就配對送出
  function dispatch() {
    while (idle.length > 0 && queue.length > 0) {
      const worker = idle.shift()!
      const task = queue.shift()!
      running.set(worker, task)
      worker.postMessage({ id: task.id, job: task.job } satisfies Request)
    }
  }

  for (let i = 0; i < size; i++) spawn()

  return {
    run(job) {
      if (closed) return Promise.reject(new Error('pool 已經關閉'))
      return new Promise((resolve, reject) => {
        queue.push({ id: nextId++, job, resolve, reject })
        dispatch()
      })
    },
    async close() {
      closed = true
      for (const task of queue.splice(0)) task.reject(new Error('pool 已經關閉'))

    },
  }
}
