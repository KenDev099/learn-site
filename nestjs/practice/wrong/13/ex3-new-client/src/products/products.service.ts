import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaService } from '../prisma/prisma.service.js'
import type { Env } from '../config/env.schema.js'

// 錯誤寫法：每個請求 new 一個 PrismaClient（每個都有自己的連線池，而且沒有關）
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService<Env, true>) {}

  async findAll() {
    const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: this.config.get('DATABASE_URL', { infer: true }) }) })
    return prisma.product.findMany({ include: { category: true }, orderBy: { id: 'asc' } })
  }
}
