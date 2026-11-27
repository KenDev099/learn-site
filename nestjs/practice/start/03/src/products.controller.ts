import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'
import type { CreateProductInput, Product, UpdateProductInput } from './product.js'
import { PricingService } from './pricing.service.js'

// 第 2 課做完的樣子：資料和邏輯都寫在 controller 裡（練習 1 要把它們搬到 ProductsService）
@Controller('products')
export class ProductsController {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee' },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee' },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee' },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea' },
    { id: 5, name: '可頌', price: 70, category: 'food' },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food' },
  ]
  private nextId = 7

  constructor(private readonly pricing: PricingService) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return category ? this.products.filter(p => p.category === category) : this.products
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const product = this.products.find(p => p.id === id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return product
  }

  @Get(':id/price')
  price(@Param('id', ParseIntPipe) id: number) {
    return { id, price: this.pricing.priceOf(this.findOne(id)) }
  }

  @Post()
  create(@Body() body: CreateProductInput) {
    const product = { id: this.nextId++, ...body }
    this.products.push(product)
    return product
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateProductInput) {
    return Object.assign(this.findOne(id), body)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    this.findOne(id)
    this.products = this.products.filter(p => p.id !== id)
  }
}
