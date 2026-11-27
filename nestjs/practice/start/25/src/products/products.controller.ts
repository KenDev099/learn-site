import { Controller, Get } from '@nestjs/common'
import { ProductsService } from './products.service.js'

@Controller('menu')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  menu() {
    return this.products.menu()
  }
}
