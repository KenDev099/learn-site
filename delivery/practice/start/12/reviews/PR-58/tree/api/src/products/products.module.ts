import { Controller, Get, Injectable, Module } from '@nestjs/common'
import { PrismaService } from '../common/prisma.service.js'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // 菜單：只列出還在賣的商品
  menu() {
    return this.prisma.product.findMany({
      where: { available: true },
      select: { id: true, name: true, price: true },
      orderBy: { id: 'asc' },
    })
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  menu() {
    return this.products.menu()
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
