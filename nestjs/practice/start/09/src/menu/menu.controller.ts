import { Controller, Get } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'

// 門口看板每 2 秒來拿一次菜單
@Controller('menu')
export class MenuController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  menu() {
    return this.products.list().map(({ id, name, price }) => ({ id, name, price }))
  }
}
