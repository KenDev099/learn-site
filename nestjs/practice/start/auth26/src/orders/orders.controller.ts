import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { Roles } from '../auth/decorators.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { OrdersService } from './orders.service.js'

// 店員與店長看門市的訂單
@Controller('stores/:storeId/orders')
@Roles('barista', 'manager')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: Principal, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.orders.list(user, storeId)
  }

  @Get(':orderId')
  get(@CurrentUser() user: Principal, @Param('storeId', ParseIntPipe) storeId: number, @Param('orderId', ParseIntPipe) orderId: number) {
    return this.orders.get(user, storeId, orderId)
  }
}
