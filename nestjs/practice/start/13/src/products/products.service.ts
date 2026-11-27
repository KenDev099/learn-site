import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 3：從資料庫查商品（含分類），依 id 由小到大
  async findAll() {
    return []
  }
}
