import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'

export type MenuItem = { id: number; name: string; price: number; category: string }

export const MENU_KEY = 'menu:v1'
const MENU_TTL = 60_000

// cache-aside（第 19 課）：先看快取，沒有才查資料庫並寫回快取
// 依賴只往一個方向：ProductsService → MenuService。菜單自己查 products（同一個 catalog 模組的表）
@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getMenu(): Promise<MenuItem[]> {
    const cached = await this.cache.get<MenuItem[]>(MENU_KEY)
    if (cached) return cached
    const products = await this.prisma.product.findMany({
      where: { active: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, price: true, category: { select: { name: true } } },
    })
    const items = products.map(({ category, ...p }) => ({ ...p, category: category.name }))
    await this.cache.set(MENU_KEY, items, MENU_TTL)
    return items
  }

  async invalidate() {
    await this.cache.del(MENU_KEY)
  }
}
