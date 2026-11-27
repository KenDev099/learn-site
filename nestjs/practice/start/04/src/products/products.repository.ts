import { Injectable } from '@nestjs/common'

export type Product = { id: number; name: string; price: number }

// 商品資料（先放在記憶體裡，第 13 課換成資料庫）。只有 ProductsService 可以用它
@Injectable()
export class ProductsRepository {
  private readonly rows: Product[] = [
    { id: 1, name: '美式咖啡', price: 80 },
    { id: 2, name: '拿鐵', price: 110 },
    { id: 3, name: '卡布奇諾', price: 110 },
    { id: 4, name: '伯爵紅茶', price: 90 },
    { id: 5, name: '可頌', price: 70 },
    { id: 6, name: '起司蛋糕', price: 120 },
  ]

  findAll(): Product[] {
    return this.rows
  }

  findById(id: number): Product | undefined {
    return this.rows.find(p => p.id === id)
  }

  insert(data: Omit<Product, 'id'>): Product {
    const product = { id: Math.max(0, ...this.rows.map(p => p.id)) + 1, ...data }
    this.rows.push(product)
    return product
  }
}
