import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import type { CreateProductInput, UpdateProductInput } from './product.js'
import { ProductsService } from './products.service.js'
import { PricingService } from './pricing.service.js'

// controller 只管 HTTP：取參數、呼叫 service、回傳結果
@Controller('products')
export class ProductsController {
  private readonly products = new ProductsService()

  constructor(
    private readonly pricing: PricingService,
  ) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return this.products.findAll(category)
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.products.findOne(id)
  }

  @Get(':id/price')
  price(@Param('id', ParseIntPipe) id: number) {
    return { id, price: this.pricing.priceOf(this.products.findOne(id)) }
  }

  @Post()
  create(@Body() body: CreateProductInput) {
    return this.products.create(body)
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProductInput) {
    return this.products.update(id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    this.products.remove(id)
  }
}
