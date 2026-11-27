// 回傳整個 Prisma model：型別檢查會過（多的欄位 TypeScript 不擋），costPrice 跟著送出去
import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { ProductNameTakenError, ProductNotFoundError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateProductDto, ProductResponse, UpdateProductDto } from './product.dto.js'

const isPrismaError = (e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(categoryId?: number): Promise<ProductResponse[]> {
    return this.prisma.product.findMany({ where: { categoryId }, orderBy: { id: 'asc' } })
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    try {
      return await this.prisma.product.create({ data: dto })
    } catch (e) {
      // 不先查再寫：交給 UNIQUE 約束，撞到了才翻譯
      if (isPrismaError(e, 'P2002')) throw new ProductNameTakenError(dto.name, { cause: e })
      throw e
    }
  }

  async update(id: number, dto: UpdateProductDto): Promise<ProductResponse> {
    try {
      return await this.prisma.product.update({ where: { id }, data: dto })
    } catch (e) {
      if (isPrismaError(e, 'P2025')) throw new ProductNotFoundError(id, { cause: e })
      if (isPrismaError(e, 'P2002') && dto.name) throw new ProductNameTakenError(dto.name, { cause: e })
      throw e
    }
  }

  async remove(id: number) {
    try {
      await this.prisma.product.delete({ where: { id } })
    } catch (e) {
      if (isPrismaError(e, 'P2025')) throw new ProductNotFoundError(id, { cause: e })
      throw e
    }
  }
}
