import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ProductNotFoundError } from '../errors/domain-errors.js'
import { Prisma } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { MenuService, type MenuItem } from './menu.service.js'
import type { CreateProductDto, UpdateProductDto } from './product.dto.js'

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MenuService)) private readonly menu: MenuService,
  ) {}

  async listActive(): Promise<MenuItem[]> {
    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, price: true, category: { select: { name: true } } },
    })
    return products.map(({ category, ...p }) => ({ ...p, category: category.name }))
  }

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({ data: dto })
    await this.menu.invalidate()
    return product
  }

  // 先寫資料庫、再刪快取（第 19 課）
  async update(id: number, dto: UpdateProductDto) {
    try {
      const product = await this.prisma.product.update({ where: { id }, data: dto })
      await this.menu.invalidate()
      return product
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new ProductNotFoundError(id)
      throw e
    }
  }
}
