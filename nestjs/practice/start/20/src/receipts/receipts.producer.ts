import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'

export const RECEIPTS_QUEUE = 'receipts'
export type ReceiptJobData = { orderId: number }

// 生產者：把「寄收據」這件事放進佇列，馬上回來，不等信寄出去
@Injectable()
export class ReceiptsProducer {
  constructor(@InjectQueue(RECEIPTS_QUEUE) private readonly queue: Queue<ReceiptJobData>) {}

  // 練習 1：同一張訂單只能有一個工作、失敗要重試、data 只放 orderId
  enqueue(orderId: number) {
    return this.queue.add('send-receipt', { orderId })
  }
}
