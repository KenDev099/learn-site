import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import type { Category } from './menu.categories.js'

export type MenuItem = { id: number; name: string; price: number; category: string }

const MENU_TTL = 60   // 錯：以為單位是秒
const CACHE_TIMEOUT = 200    // Redis 超過 200 毫秒沒回應，就當作失敗

// key 的格式集中在一個地方：讀、寫、刪都用它，才不會寫錯字
const menuKey = (category?: string) => (category ? `menu:v1:category:${category}` : 'menu:v1:all')

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async getMenu(category?: Category): Promise<MenuItem[]> {
    const key = menuKey(category)
    const cached = await this.safely('讀取', key, () => this.cache.get<MenuItem[]>(key))
    if (cached !== undefined) return cached

    const items = await this.prisma.product.findMany({
      where: { active: true, category },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, price: true, category: true },
    })
    await this.safely('寫入', key, () => this.cache.set(key, items, MENU_TTL))
    return items
  }

  // 一個商品變了：全部菜單和它那個分類的菜單都要重新查
  async invalidate(category: string): Promise<void> {
    const keys = [menuKey(), menuKey(category)]
    await this.safely('刪除', keys.join(', '), () => this.cache.mdel(keys))
  }

  // 快取只是加速用：出錯或太慢就記 log，回傳 undefined，呼叫的人改走資料庫
  private async safely<T>(action: string, key: string, run: () => Promise<T>): Promise<T | undefined> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`超過 ${CACHE_TIMEOUT}ms 沒有回應`)), CACHE_TIMEOUT)
    })
    try {
      return await Promise.race([run(), timeout])
    } catch (e) {
      this.logger.warn(`快取${action}失敗（${key}），改用資料庫：${e instanceof Error ? e.message : e}`)
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }
}
