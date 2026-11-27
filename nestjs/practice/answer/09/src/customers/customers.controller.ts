import { Controller, Get, NotFoundException, Param, ParseIntPipe, SerializeOptions } from '@nestjs/common'
import { customerResponseSchema } from './customer.schema.js'
import { CustomersService } from './customers.service.js'

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get(':id')
  @SerializeOptions({ schema: customerResponseSchema })
  findOne(@Param('id', ParseIntPipe) id: number) {
    const customer = this.customers.find(id)
    if (!customer) throw new NotFoundException(`找不到顧客 ${id}`, { errorCode: 'CUSTOMER_NOT_FOUND' })
    return customer
  }
}
