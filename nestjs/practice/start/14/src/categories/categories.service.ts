import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 5：API 改成回傳 [{ id, title }]
  findAll() {
    return this.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
  }
}
