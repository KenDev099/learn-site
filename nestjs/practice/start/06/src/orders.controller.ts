import { Body, Controller, Post } from '@nestjs/common'

type OrderLine = { productId: number; quantity: number }

@Controller('orders')
export class OrdersController {
  private nextId = 1

  // 顧客在網站上下單，不需要管理員金鑰
  @Post()
  create(@Body() body: { items: OrderLine[] }) {
    return { id: this.nextId++, items: body.items }
  }
}
