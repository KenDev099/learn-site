import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateProductDto, UpdateProductDto } from './product.dto.js'

// 練習 2：這個 service 能動，但有三個問題：
//   1. 回傳整個 Prisma model：costPrice（成本）跟著送到前端
//   2. 名稱重複時，Prisma 的錯誤直接變成 500
//   3. 更新、刪除不存在的商品時也是 500
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(categoryId?: number) {
    return this.prisma.product.findMany({ include: { category: true }, orderBy: { id: 'asc' } })
  }

  create(dto: CreateProductDto) {
    return this.prisma.product.create({ data: dto })
  }

  update(id: number, dto: UpdateProductDto) {
    return this.prisma.product.update({ where: { id }, data: dto })
  }

  async remove(id: number) {
    await this.prisma.product.delete({ where: { id } })
  }
}
