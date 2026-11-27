import { Injectable } from '@nestjs/common'

export type Category = 'coffee' | 'tea' | 'food'
export type Product = { id: number, name: string, price: number, category: Category, stock: number }

// 商品與庫存（這一題不用資料庫，放在記憶體）
@Injectable()
export class ProductsService {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee', stock: 50 },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee', stock: 30 },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee', stock: 20 },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea', stock: 15 },
    { id: 5, name: '可頌', price: 70, category: 'food', stock: 5 },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food', stock: 2 },
  ]

  list() {
    return this.products
  }

  find(id: number) {
    return this.products.find(p => p.id === id)
  }
}
