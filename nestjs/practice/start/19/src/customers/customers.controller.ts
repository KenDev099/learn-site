import { BadRequestException, Controller, Get, Headers } from '@nestjs/common'
import { CustomersService } from './customers.service.js'

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  // App 的「我的訂單」。這門課還沒教登入（auth 課才教），先用 X-Customer-Id 標頭代表「我是誰」
  @Get('me/orders')
  myOrders(@Headers('x-customer-id') raw?: string) {
    const customerId = Number(raw)
    if (!Number.isInteger(customerId) || customerId <= 0) throw new BadRequestException('X-Customer-Id 標頭要是正整數')
    return this.customers.recentOrders(customerId)
  }
}
