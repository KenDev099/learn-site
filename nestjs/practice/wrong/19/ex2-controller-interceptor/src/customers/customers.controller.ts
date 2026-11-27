import { CacheInterceptor } from '@nestjs/cache-manager'
import { BadRequestException, Controller, Get, Headers, UseInterceptors } from '@nestjs/common'
import { CustomersService } from './customers.service.js'

@Controller('customers')
@UseInterceptors(CacheInterceptor)   // 錯：key 只有網址，不分是誰
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get('me/orders')
  myOrders(@Headers('x-customer-id') raw?: string) {
    const customerId = Number(raw)
    if (!Number.isInteger(customerId) || customerId <= 0) throw new BadRequestException('X-Customer-Id 標頭要是正整數')
    return this.customers.recentOrders(customerId)
  }
}
