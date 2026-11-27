import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post } from '@nestjs/common'

type Product = { id: number; name: string; price: number }

// 商品資料先放在記憶體（第 13 課換成資料庫）
// 練習 2：新增、修改、刪除商品只有店長能做；查詢誰都可以
@Controller('products')
export class ProductsController {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80 },
    { id: 2, name: '拿鐵', price: 110 },
    { id: 3, name: '卡布奇諾', price: 110 },
    { id: 4, name: '伯爵紅茶', price: 90 },
    { id: 5, name: '可頌', price: 70 },
    { id: 6, name: '起司蛋糕', price: 120 },
  ]
  private nextId = 7

  @Get()
  findAll() {
    return this.products
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const product = this.products.find(p => p.id === id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return product
  }

  @Post()
  create(@Body() body: { name: string; price: number }) {
    const product = { id: this.nextId++, name: body.name, price: body.price }
    this.products.push(product)
    return product
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; price?: number }) {
    const product = this.findOne(id)
    Object.assign(product, { name: body.name ?? product.name, price: body.price ?? product.price })
    return product
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    this.findOne(id)
    this.products = this.products.filter(p => p.id !== id)
  }
}
