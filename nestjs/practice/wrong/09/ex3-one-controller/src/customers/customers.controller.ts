import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common'
import { CustomersService } from './customers.service.js'

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const customer = this.customers.find(id)
    if (!customer) throw new NotFoundException(`找不到顧客 ${id}`, { errorCode: 'CUSTOMER_NOT_FOUND' })
    const { phone, internalNote, ...rest } = customer
    return rest
  }
}
