import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { Category } from './menu.categories.js'

export type MenuItem = { id: number; name: string; price: number; category: string }

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // 練習 1：cache-aside。先查 Redis，沒有再查資料庫並寫回 Redis（TTL 60 秒）
  // 練習 4：Redis 出錯或沒回應時，記一筆 warn，直接用資料庫的結果
  async getMenu(category?: Category): Promise<MenuItem[]> {
    return this.prisma.product.findMany({
      where: { active: true, category },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, price: true, category: true },
    })
  }

  // 練習 3：商品改價或停售後，ProductsService 會呼叫這裡，讓相關的菜單快取失效
  async invalidate(category: string): Promise<void> {}
}
