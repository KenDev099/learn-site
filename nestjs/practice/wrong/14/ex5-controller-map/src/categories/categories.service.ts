import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  // 只在回傳時改名：Prisma 裡還是 name
  async findAll() {
    const rows = await this.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } })
    return rows.map(c => ({ id: c.id, title: c.name }))
  }
}
