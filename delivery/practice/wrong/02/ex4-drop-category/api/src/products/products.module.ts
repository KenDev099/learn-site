import { Body, Controller, Get, Injectable, Module, Param, ParseIntPipe, Patch } from '@nestjs/common'
import { IsBoolean } from 'class-validator'
import { PrismaService } from '../common/prisma.service.js'

export class SoldOutDto {
  @IsBoolean()
  soldOut: boolean
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // 菜單：只列出還在賣的商品（售完的也列出來，畫面上標「已售完」）
  menu() {
    return this.prisma.product.findMany({
      where: { available: true },
      select: { id: true, name: true, price: true, soldOut: true },
      orderBy: { id: 'asc' },
    })
  }

  setSoldOut(id: number, soldOut: boolean) {
    return this.prisma.product.update({
      where: { id },
      data: { soldOut },
      select: { id: true, name: true, price: true, soldOut: true },
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

  // 店員標記售完／恢復供應
  @Patch(':id/sold-out')
  setSoldOut(@Param('id', ParseIntPipe) id: number, @Body() body: SoldOutDto) {
    return this.products.setSoldOut(id, body.soldOut)
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}
