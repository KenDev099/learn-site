import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import type { CreateProductInput, Product, UpdateProductInput } from './product.js'
import { ProductsService } from './products.service.js'
import { PricingService } from './pricing.service.js'

// controller 只管 HTTP：取參數、呼叫 service、回傳結果
@Controller('products')
export class ProductsController {
  // 算價格的路由還留著自己的一份商品
  private readonly menu: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee' },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee' },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee' },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' },
    { id: 5, name: '可頌', price: 70, category: 'food' },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food' },
  ]

  constructor(
    private readonly products: ProductsService,
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
    const product = this.menu.find(p => p.id === id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return { id, price: this.pricing.priceOf(product) }
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
