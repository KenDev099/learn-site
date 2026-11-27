import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import { CreateProductDto, UpdateProductDto } from './product.dto.js'
import { ProductsService } from './products.service.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query('categoryId', new ParseIntPipe({ optional: true })) categoryId?: number) {
    return this.products.findAll(categoryId)
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.products.remove(id)
  }
}
