import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // controller 是 HTTP 這一層，在這裡丟 HttpException 沒問題；errorCode 是 Nest 12 新增的選項
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const product = this.products.find(id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`, { errorCode: 'PRODUCT_NOT_FOUND' })
    return product
  }
}
