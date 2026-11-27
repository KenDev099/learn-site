import { Injectable } from '@nestjs/common'
import { setTimeout as sleep } from 'node:timers/promises'
import { OrdersService } from '../orders/orders.service.js'

// 每日營收報表：之後會換成一句很重的 SQL（第 16 課），這裡用 sleep 模擬
@Injectable()
export class ReportsService {
  constructor(private readonly orders: OrdersService) {}

  async daily() {
    await sleep(300)
    return this.orders.countAndRevenue()
  }
}
