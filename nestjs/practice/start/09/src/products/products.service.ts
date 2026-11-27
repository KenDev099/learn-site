import { Injectable } from '@nestjs/common'

export type Product = { id: number, name: string, price: number, stock: number }

// 商品與庫存（還沒有資料庫，先放在記憶體）。找不到就回 undefined：要不要當成錯誤，由呼叫的人決定
@Injectable()
export class ProductsService {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, stock: 50 },
    { id: 2, name: '拿鐵', price: 110, stock: 30 },
    { id: 3, name: '卡布奇諾', price: 110, stock: 20 },
    { id: 4, name: '伯爵紅茶', price: 90, stock: 15 },
    { id: 5, name: '可頌', price: 70, stock: 5 },
    { id: 6, name: '起司蛋糕', price: 120, stock: 2 },
  ]

  list() {
    return this.products
  }

  find(id: number) {
    return this.products.find(p => p.id === id)
  }
}
