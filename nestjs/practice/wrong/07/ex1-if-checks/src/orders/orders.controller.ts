import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common'
import { CreateOrderDto } from './create-order.dto.js'
import { ListOrdersQuery } from './list-orders.query.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 在 handler 裡自己用 if 檢查
  @Post()
  create(@Body() body: any) {
    const allowed = ['customerId', 'items', 'note']
    for (const k of Object.keys(body)) if (!allowed.includes(k)) throw new BadRequestException(`${k} 不允許`)
    if (!Number.isInteger(body.customerId) || body.customerId < 1) throw new BadRequestException('customerId 不對')
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) throw new BadRequestException('items 不對')
    for (const it of body.items) {
      if (!Number.isInteger(it.productId) || it.productId < 1) throw new BadRequestException('productId 不對')
      if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 10) throw new BadRequestException('qty 不對')
      if (!['S', 'M', 'L'].includes(it.size)) throw new BadRequestException('size 不對')
    }
    if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 50)) throw new BadRequestException('note 不對')
    return this.orders.create(body as CreateOrderDto)
  }

  @Get()
  list(@Query() query: ListOrdersQuery) {
    return this.orders.list(query)
  }
}
