import { Body, Controller, Headers, Param, ParseIntPipe, Patch, Post, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'
import { CreateProductDto, UpdateProductDto } from './product.dto.js'
import { ProductsService } from './products.service.js'

@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private assertAdmin(key: string | undefined) {
    if (key !== this.config.get('ADMIN_KEY', { infer: true })) throw new UnauthorizedException('需要管理員金鑰')
  }

  @Post()
  create(@Headers('x-admin-key') key: string | undefined, @Body() dto: CreateProductDto) {
    this.assertAdmin(key)
    return this.products.create(dto)
  }

  @Patch(':id')
  update(@Headers('x-admin-key') key: string | undefined, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    this.assertAdmin(key)
    return this.products.update(id, dto)
  }
}
