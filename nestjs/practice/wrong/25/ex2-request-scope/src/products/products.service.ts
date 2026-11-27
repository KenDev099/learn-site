import { Injectable, Scope } from '@nestjs/common'
import { StoreContext } from '../store/store-context.js'

export type Product = { id: number; name: string; price: number }

const PRODUCTS: Product[] = [
  { id: 1, name: '美式咖啡', price: 80 },
  { id: 2, name: '拿鐵', price: 110 },
  { id: 3, name: '卡布奇諾', price: 110 },
  { id: 4, name: '伯爵紅茶', price: 90 },
  { id: 5, name: '可頌', price: 70 },
  { id: 6, name: '起司蛋糕', price: 120 },
]

// 每間分店賣的商品：1 號信義店全部都賣，2 號板橋店只有飲料
const STORE_MENUS: Record<number, number[]> = { 1: [1, 2, 3, 4, 5, 6], 2: [1, 2, 3, 4] }

@Injectable({ scope: Scope.REQUEST })
export class ProductsService {
  static created = 0   // 建立過幾次（觀察用）

  constructor(private readonly store: StoreContext) {
    ProductsService.created++
  }

  async menu(): Promise<Product[]> {
    await new Promise(resolve => setTimeout(resolve, 20))   // 模擬查資料庫
    const ids = STORE_MENUS[this.store.storeId] ?? []
    return PRODUCTS.filter(p => ids.includes(p.id))
  }

  findOne(id: number): Product | undefined {
    return PRODUCTS.find(p => p.id === id)
  }
}
