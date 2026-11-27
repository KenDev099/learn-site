import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common'

export type Product = { id: number, name: string, price: number, category: string, tags: string[] }

// 資料先放在 controller 的欄位裡（記憶體），第 3 課搬到 service，第 13 課換成資料庫
@Controller('products')
export class ProductsController {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee', tags: ['hot', 'iced'] },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee', tags: ['hot', 'iced', 'milk'] },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee', tags: ['hot', 'milk'] },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea', tags: ['hot', 'iced'] },
    { id: 5, name: '可頌', price: 70, category: 'food', tags: ['bakery'] },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food', tags: ['dessert'] },
  ]
  private featuredIds = [2, 6]   // 本週推薦：拿鐵、起司蛋糕
  private nextId = 7

  @Get()
  findAll(@Query('category') category?: string) {
    return category ? this.products.filter(p => p.category === category) : this.products
  }

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('maxPrice', new ParseIntPipe({ optional: true })) maxPrice?: number,
    @Query('tags') tags?: string | string[],
  ) {
    const wanted = tags === undefined ? [] : [tags].flat()
    return this.products.filter(p =>
      (q === undefined || p.name.includes(q)) &&
      (maxPrice === undefined || p.price <= maxPrice) &&
      wanted.every(t => p.tags.includes(t)))
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const product = this.products.find(p => p.id === id)
    if (!product) throw new NotFoundException(`找不到商品 ${id}`)
    return product
  }

  @Get('featured')
  featured() {
    return this.products.filter(p => this.featuredIds.includes(p.id))
  }

  @Post()
  create(@Body() body: Omit<Product, 'id'>) {
    const product = { ...body, id: this.nextId++ }
    this.products.push(product)
    return product
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Partial<Omit<Product, 'id'>>) {
    const product = this.findOne(id)
    Object.assign(product, body, { id })   // body 裡就算有 id 也不能改掉它
    return product
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    const product = this.findOne(id)
    this.products = this.products.filter(p => p !== product)
  }
}
