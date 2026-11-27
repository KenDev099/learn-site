import { Injectable } from '@nestjs/common'
import { Prisma } from '../generated/prisma/client.js'
import { ProductNameTakenError, ProductNotFoundError } from '../errors/domain-errors.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { CreateProductDto, ProductResponse, UpdateProductDto } from './product.dto.js'

// API 要的欄位：只 select 這些，資料表之後多了欄位也不會跟著送出去
const productSelect = {
  id: true,
  name: true,
  price: true,
  isAvailable: true,
  categoryId: true,
} satisfies Prisma.ProductSelect

const isPrismaError = (e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(categoryId?: number): Promise<ProductResponse[]> {
    return this.prisma.product.findMany({ where: { categoryId }, select: productSelect, orderBy: { id: 'asc' } })
  }

  async create(dto: CreateProductDto): Promise<ProductResponse> {
    // 先查再寫：並發時兩個請求都查不到
    const taken = await this.prisma.product.findFirst({ where: { name: dto.name } })
    if (taken) throw new ProductNameTakenError(dto.name)
    return this.prisma.product.create({ data: dto, select: productSelect })
  }

  async update(id: number, dto: UpdateProductDto): Promise<ProductResponse> {
    try {
      return await this.prisma.product.update({ where: { id }, data: dto, select: productSelect })
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
