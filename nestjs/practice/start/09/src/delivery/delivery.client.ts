import { Injectable } from '@nestjs/common'
import { setTimeout as sleep } from 'node:timers/promises'

// 外送平台的 API（這裡用 sleep 模擬網路往返）。對方偶爾會卡住好幾秒，我們控制不了
@Injectable()
export class DeliveryClient {
  async eta(orderId: number) {
    await sleep(200)
    return { orderId, minutes: 25 }
  }
}
