import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'

export const RECEIPTS_QUEUE = 'receipts'
export type ReceiptJobData = { orderId: number }

// 生產者：把「寄收據」這件事放進佇列，馬上回來，不等信寄出去
@Injectable()
export class ReceiptsProducer {
  constructor(@InjectQueue(RECEIPTS_QUEUE) private readonly queue: Queue<ReceiptJobData>) {}

  enqueue(orderId: number) {
    return this.queue.add('send-receipt', { orderId }, {   // data 只放 id：worker 處理時再查最新的資料
      jobId: `receipt:${orderId}`,                          // 同一張訂單只會有一個工作（自訂 id 不能含冒號、不能是純數字）
      attempts: 3,                                          // 最多做 3 次（第 1 次＋重試 2 次）
      backoff: { type: 'exponential', delay: 1000 },        // 失敗後等 1 秒、2 秒再試
      removeOnComplete: { age: 24 * 3600 },                 // 完成的工作留 1 天：這段時間內 jobId 去重有效
      removeOnFail: { age: 7 * 24 * 3600 },                 // 失敗的留 7 天，讓人有時間查原因、重試
    })
  }
}
