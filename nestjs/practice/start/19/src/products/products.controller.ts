import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common'
import { ProductsService } from './products.service.js'
import { UpdateProductDto } from './update-product.dto.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }
}
