import { Body, Controller, Delete, ForbiddenException, Get, Headers, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, UnauthorizedException } from '@nestjs/common'
import { timingSafeEqual } from 'node:crypto'

type Product = { id: number; name: string; price: number }

function check(given?: string) {
  if (!given) throw new UnauthorizedException()
  const a = Buffer.from(given), b = Buffer.from(process.env.ADMIN_KEY ?? '')
  if (!b.length || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException()
}

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
  findAll() { return this.products }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    const product = this.products.find(p => p.id === id)
    if (!product) throw new NotFoundException()
    return product
  }

  @Post()
  create(@Headers('x-admin-key') key: string | undefined, @Body() body: { name: string; price: number }) {
    check(key)
    const product = { id: this.nextId++, name: body.name, price: body.price }
    this.products.push(product)
    return product
  }

  @Patch(':id')
  update(@Headers('x-admin-key') key: string | undefined, @Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; price?: number }) {
    check(key)
    const product = this.findOne(id)
    Object.assign(product, { name: body.name ?? product.name, price: body.price ?? product.price })
    return product
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Headers('x-admin-key') key: string | undefined, @Param('id', ParseIntPipe) id: number) {
    check(key)
    this.findOne(id)
    this.products = this.products.filter(p => p.id !== id)
  }
}
