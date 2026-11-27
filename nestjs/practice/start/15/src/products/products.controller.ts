import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // 後台改價格：前端送出畫面上看到的 version
  @Patch(':id/price')
  updatePrice(@Param('id', ParseIntPipe) id: number, @Body() body: { price: number; version: number }) {
    return this.products.updatePrice(id, body.price, body.version)
  }
}
