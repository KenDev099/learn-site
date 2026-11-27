import { Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'
import { RequirePermissions } from '../auth/permissions.decorator.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { OrdersService } from './orders.service.js'

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // 「我的訂單」：給顧客用
  @RequirePermissions('order:read')
  @Get()
  list(@CurrentUser() user: Principal) {
    return this.orders.findMine(user)
  }

  @RequirePermissions('order:read')
  @Get(':id')
  get(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.orders.findMineById(user, id)
  }

  // 顧客取消自己還沒製作的訂單：跟下單同一個權限
  @RequirePermissions('order:create')
  @Patch(':id/cancel')
  cancel(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number) {
    return this.orders.cancelMine(user, id)
  }

  // 店員核准退款（單一門市，所以不分門市；多門市在第 26 課）
  @RequirePermissions('order:refund')
  @Post(':id/refund')
  @HttpCode(200)
  refund(@Param('id', ParseIntPipe) id: number) {
    return this.orders.refund(id)
  }
}
