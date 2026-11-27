import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import type { Env } from '../config/env.schema.js'

// 錯誤寫法：每個請求 new 一個 PrismaClient，用完就關（連線數不會爆，但每次都重新建立連線池、繞過注入）
@Injectable()
export class ProductsService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async findAll() {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: this.config.get('DATABASE_URL', { infer: true }) }) })
    try {
      return await prisma.product.findMany({ include: { category: true }, orderBy: { id: 'asc' } })
    } finally {
      await prisma.$disconnect()
    }
  }
}
