import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ReceiptsProducer } from '../receipts/receipts.producer.js'

// relay：把 outbox_events 裡還沒送出的事件送進佇列。第 21 課會用 @Interval 每秒呼叫一次
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: ReceiptsProducer,
  ) {}

  // 練習 4：回傳這一次送出了幾筆
  async publishPending(): Promise<number> {
    throw new Error('還沒寫：OutboxRelay.publishPending')
  }
}
