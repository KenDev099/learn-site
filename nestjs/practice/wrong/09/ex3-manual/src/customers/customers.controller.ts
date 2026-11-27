import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common'
import { CustomersService } from './customers.service.js'

// 在 controller 裡自己挑欄位：沒有 schema 驗證，資料少了欄位時照樣送出 200
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const customer = this.customers.find(id)
    if (!customer) throw new NotFoundException(`找不到顧客 ${id}`, { errorCode: 'CUSTOMER_NOT_FOUND' })
    return { id: customer.id, name: customer.name, stamps: customer.stamps }
  }
}
