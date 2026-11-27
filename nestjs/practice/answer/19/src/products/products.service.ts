import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { MenuService } from '../menu/menu.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { UpdateProductDto } from './update-product.dto.js'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menu: MenuService,
  ) {}

  async update(id: number, dto: UpdateProductDto) {
    let product
    try {
      product = await this.prisma.product.update({ where: { id }, data: dto })
    } catch (e) {
      // 第 14 課：P2025 = 要更新的那一筆不存在
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException(`找不到商品 ${id}`)
      throw e
    }
    // 先寫資料庫、再刪快取：反過來的話，中間進來的讀取會把舊資料寫回快取
    await this.menu.invalidate(product.category)
    return product
  }
}
