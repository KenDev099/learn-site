import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common'
import { Roles } from '../auth/decorators.js'
import { CurrentUser, type Principal } from '../auth/principal.js'
import { PrismaService } from '../prisma.service.js'
import { ImageImportService } from './image-import.service.js'
import { CreateProductDto, ImportImageDto } from './products.dto.js'

@Controller('products')
export class ProductsController {
  constructor(private readonly prisma: PrismaService, private readonly images: ImageImportService) {}

  // 自己品牌的菜單
  @Get()
  list(@CurrentUser() user: Principal) {
    return this.prisma.product.findMany({ where: { tenantId: user.tenantId }, orderBy: { id: 'asc' } })
  }

  @Post()
  @Roles('manager')
  create(@CurrentUser() user: Principal, @Body() dto: CreateProductDto) {
    return this.prisma.product.create({ data: { tenantId: user.tenantId, name: dto.name, price: dto.price } })
  }

  @Post(':id/image-from-url')
  @Roles('manager')
  @HttpCode(200)
  importImage(@CurrentUser() user: Principal, @Param('id', ParseIntPipe) id: number, @Body() dto: ImportImageDto) {
    return this.images.importFromUrl(user, id, dto.url)
  }
}
