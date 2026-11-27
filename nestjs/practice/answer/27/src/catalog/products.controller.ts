import { Body, Controller, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'
import { AdminGuard } from './admin.guard.js'
import { CreateProductDto, UpdateProductDto } from './product.dto.js'
import { ProductsService } from './products.service.js'

// 管理後台用：新增商品、改名改價、上下架。guard 掛在 class 上，之後新增的路由也自動受保護
@Controller({ path: 'products', version: '1' })
@UseGuards(AdminGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }
}
