import { Body, Controller, Get, Headers, Param, ParseIntPipe, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { CreateOrderDto } from './create-order.dto.js'
import { OrdersService } from './orders.service.js'

@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 用 @Res() 自己送出回應：狀態碼用存下來的那個，內容送存下來的原始字串（重送時一字不差）
  @Post()
  async create(@Headers('idempotency-key') key: string | undefined, @Body() dto: CreateOrderDto, @Res() res: Response) {
    const saved = await this.orders.create(dto, key)
    res.status(saved.status).type('application/json').send(saved.body)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id)
  }
}
