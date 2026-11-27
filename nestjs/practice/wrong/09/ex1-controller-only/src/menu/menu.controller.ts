import { Controller, Get, UseInterceptors } from '@nestjs/common'
import { TimingInterceptor } from '../interceptors/timing.interceptor.js'
import { ProductsService } from '../products/products.service.js'

@Controller('menu')
@UseInterceptors(TimingInterceptor)
export class MenuController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  menu() {
    return this.products.list().map(({ id, name, price }) => ({ id, name, price }))
  }
}
