import {
  Body, Controller, ForbiddenException, Get, Header, HttpCode, Logger, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UnprocessableEntityException, UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { OrderRequest, type OrderResponse } from '../../../shared/contract.js'
import { type Account, CurrentAccount, LoginGuard } from '../auth/auth.module.js'
import { FeatureFlags } from '../common/feature-flags.js'
import { pickupLabel } from '../pickup/pickup-label.js'
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

  constructor(
    private readonly orders: OrdersService,
    private readonly flags: FeatureFlags,
  ) {}

  @Post()
  async create(@Body({ schema: LegacyOrderRequest }) body: LegacyOrderRequest, @Res({ passthrough: true }) res: Response) {
    const { note, ...input } = body
    if (note !== undefined) {
      if (input.customerNote !== undefined && input.customerNote !== note) {
        throw new UnprocessableEntityException({ code: 'FIELD_CONFLICT', message: 'note 與 customerNote 不同；請只送 customerNote' })
      }
      res.setHeader('Deprecation', NOTE_DEPRECATED_AT)
      this.logger.warn(`legacy field note customerId=${input.customerId}`)
    }
    return toResponse(await this.orders.create({ ...input, customerNote: input.customerNote ?? note }))
  }

  // 店員訂單搜尋（CAFE-41，v2.8.0）：櫃台用顧客的備註找單，例如「燕麥奶」。由旗標 orders.search 控制
  // 要寫在 @Get(':id') 前面：路由依宣告順序比對，寫在後面的話 /orders/search 會被當成 id＝search
  @Get('search')
  @UseGuards(LoginGuard)
  async search(@Query('q') q: string | undefined, @CurrentAccount() account: Account) {
    // 旗標關閉時就像這個功能不存在：回 404
    if ((await this.flags.percent('orders.search')) === 0) throw new NotFoundException({ code: 'NOT_FOUND', message: '找不到這個功能' })
    if (account.role !== 'staff') throw new ForbiddenException({ code: 'STAFF_ONLY', message: '只有店員可以搜尋訂單' })
    const keyword = q?.trim() ?? ''
    // 至少 3 個字：pg_trgm 是用「每 3 個字一組」比對，太短的關鍵字無法縮小範圍
    if (keyword.length < 3) throw new UnprocessableEntityException({ code: 'VALIDATION_FAILED', message: 'q：至少 3 個字' })
    return this.orders.search(keyword)
  }

  // SEC-7（v2.8.0）：以前任何人改網址上的 id 就能看別人的訂單（BOLA）。現在要登入，顧客只看得到自己的
  @Get(':id')
  @UseGuards(LoginGuard)
  async findOne(@Param('id', ParseIntPipe) id: number, @CurrentAccount() account: Account) {
    return toResponse(await this.orders.findVisible(id, account))
  }

  // 櫃台小票（CAFE-21）：純文字，店內的印表機直接印。店員照上面的取餐時間準備飲料
  @Get(':id/ticket')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @UseGuards(LoginGuard)
  async ticket(@Param('id', ParseIntPipe) id: number, @CurrentAccount() account: Account) {
    const order = await this.orders.findVisible(id, account)
    return [
      `訂單 #${order.id}`,
      order.pickupAt ? `取餐 ${pickupLabel(order.pickupAt)}` : '現點現做',
      `合計 ${order.total} 元`,
    ].join('\n')
  }

  // CAFE-50：取消訂單並全額退款。200 回取消後的訂單（已經取消過也是 200）；吧台已經開始製作 409 ORDER_NOT_CANCELLABLE；別人的訂單 404
  @Post(':id/cancel')
  @HttpCode(200)
  @UseGuards(LoginGuard)
  async cancel(@Param('id', ParseIntPipe) id: number, @CurrentAccount() account: Account) {
    return toResponse(await this.orders.cancel(id, account))
  }
}
