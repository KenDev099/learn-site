import { Body, Controller, Headers, Param, ParseIntPipe, Patch, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'
import { CreateProductDto, UpdateProductDto } from './product.dto.js'
import { ProductsService } from './products.service.js'

// 管理後台用：新增商品、改名改價、上下架
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post()
  create(@Headers('x-admin-key') key: string | undefined, @Body() dto: CreateProductDto) {
    if (key !== this.config.get('ADMIN_KEY', { infer: true })) throw new UnauthorizedException('需要管理員金鑰')
    return this.products.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto)
  }
}
