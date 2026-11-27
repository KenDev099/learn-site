import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common'
import { Roles } from '../auth/decorators.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { CustomersService } from './customers.service.js'

@Controller('stores/:storeId/customers')
@Roles('barista', 'manager')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@CurrentUser() user: Principal, @Param('storeId', ParseIntPipe) storeId: number) {
    return this.customers.list(user, storeId)
  }
}
