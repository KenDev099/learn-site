import { Body, Controller, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'

type OrderLine = { productId: number; quantity: number }

@Controller('orders')
export class OrdersController {
  private nextId = 1

  // 顧客在網站上下單，不需要管理員金鑰；每個客戶端 10 秒最多 3 次
  @Post()
  @Throttle({ default: { limit: 3, ttl: 10_000 } })
  create(@Body() body: { items: OrderLine[] }) {
    return { id: this.nextId++, items: body.items }
  }
}
