import { Body, Controller, Get, Logger, Param, ParseIntPipe, Post, Res, UnprocessableEntityException } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { OrderRequest, type OrderResponse } from '../../../shared/contract.js'
import { OrdersService } from './orders.service.js'

// CAFE-18 相容期：舊前端還會送 note、讀 note。
// 移除條件：warn log「legacy field note」連續 14 天是 0 之後，刪掉 LegacyOrderRequest、note 的回應欄位與這段註解
const LegacyOrderRequest = OrderRequest.extend({ note: z.string().max(200).optional() })
type LegacyOrderRequest = z.infer<typeof LegacyOrderRequest>
const NOTE_DEPRECATED_AT = '@1793923200'   // RFC 9745：note 從 2026-11-06 00:00 UTC 起不建議使用

type Order = Awaited<ReturnType<OrdersService['findOne']>>

// 資料庫的 note 欄位 → API 的 customerNote；名字可以不同，對應只寫在這裡
function toResponse(order: Order): OrderResponse & { note: string | null } {
  return {
    id: order.id,
    status: order.status,
    total: order.total,
    customerNote: order.note,
    note: order.note,   // 相容期：給還沒更新的舊前端
    orderedAt: order.orderedAt.toISOString(),
    pickupAt: order.pickupAt?.toISOString() ?? null,
    items: order.items.map(i => ({ productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
  }
}

@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name)

  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(@Body({ schema: LegacyOrderRequest }) body: LegacyOrderRequest, @Res({ passthrough: true }) res: Response) {
    const { note, ...input } = body
    if (note !== undefined) {
      res.setHeader('Deprecation', NOTE_DEPRECATED_AT)
      this.logger.warn(`legacy field note customerId=${input.customerId}`)
    }
    return toResponse(await this.orders.create({ ...input, customerNote: input.customerNote ?? note }))
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return toResponse(await this.orders.findOne(id))
  }
}
