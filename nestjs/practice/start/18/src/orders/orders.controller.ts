import { ConflictException, Controller, HttpCode, NotFoundException, Param, ParseIntPipe, Post } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { OrdersService } from './orders.service.js'

const ORDER_SELECT = { id: true, customerId: true, total: true, status: true } as const

// 一個肥 controller：取參數、查資料庫、判斷狀態規則、寫入、決定 HTTP 狀態碼，全部擠在一起
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  @Post(':id/pay')
  @HttpCode(200)
  async pay(@Param('id', ParseIntPipe) id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    if (order.status !== 'pending') throw new ConflictException(`訂單是 ${order.status}，不能付款`)
    return this.prisma.order.update({ where: { id }, data: { status: 'paid' }, select: ORDER_SELECT })
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancel(@Param('id', ParseIntPipe) id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } })
    if (!order) throw new NotFoundException(`找不到訂單 ${id}`)
    if (order.status !== 'pending' && order.status !== 'paid') throw new ConflictException(`訂單是 ${order.status}，不能取消`)
    return this.prisma.order.update({ where: { id }, data: { status: 'cancelled' }, select: ORDER_SELECT })
  }
}
