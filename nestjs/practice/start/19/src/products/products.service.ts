import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { MenuService } from '../menu/menu.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UpdateProductDto } from './update-product.dto.js'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,   // 練習 3 會用到
  ) {}

  async update(id: number, dto: UpdateProductDto) {
    try {
      const product = await this.prisma.product.update({ where: { id }, data: dto })
      // 練習 3：讓菜單快取失效
      return product
    } catch (e) {
      // 第 14 課：P2025 = 要更新的那一筆不存在
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException(`找不到商品 ${id}`)
      throw e
    }
  }
}
