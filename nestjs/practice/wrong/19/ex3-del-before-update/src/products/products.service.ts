import { Injectable, NotFoundException } from '@nestjs/common'
import { MenuService } from '../menu/menu.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UpdateProductDto } from './update-product.dto.js'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
  ) {}

  // 錯：先刪快取再寫資料庫
  async update(id: number, dto: UpdateProductDto) {
    const current = await this.prisma.product.findUnique({ where: { id } })
    if (!current) throw new NotFoundException(`找不到商品 ${id}`)
    await this.menu.invalidate(current.category)
    return this.prisma.product.update({ where: { id }, data: dto })
  }
}
