import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common'
import { CustomersService } from './customers.service.js'
import { ListOrdersQuery } from './list-orders.query.js'

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  // App 的「我的訂單」：往下捲動時一頁一頁載入
  @Get(':id/orders')
  listOrders(@Param('id', ParseIntPipe) id: number, @Query() query: ListOrdersQuery) {
    return this.customers.listOrders(id, query)
  }
}
