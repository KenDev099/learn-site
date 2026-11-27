import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ProductsService } from './products.service.js'

export type MenuItem = { id: number; name: string; price: number; category: string }

export const MENU_KEY = 'menu:v1'
const MENU_TTL = 60_000

// cache-aside（第 19 課）：先看快取，沒有才查資料庫並寫回快取
@Injectable()
export class MenuService {
  constructor(
    @Inject(forwardRef(() => ProductsService)) private readonly products: ProductsService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getMenu(): Promise<MenuItem[]> {
    const cached = await this.cache.get<MenuItem[]>(MENU_KEY)
    if (cached) return cached
    const items = await this.products.listActive()
    await this.cache.set(MENU_KEY, items, MENU_TTL)
    return items
  }

  async invalidate() {
    await this.cache.del(MENU_KEY)
  }
}
