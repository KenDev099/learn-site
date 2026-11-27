import { Controller, Get, Param } from '@nestjs/common'

export type Product = { id: number, name: string, price: number, category: string, tags: string[] }

// 資料先放在 controller 的欄位裡（記憶體），第 3 課搬到 service，第 13 課換成資料庫
@Controller('products')
export class ProductsController {
  private products: Product[] = [
    { id: 1, name: '美式咖啡', price: 80, category: 'coffee', tags: ['hot', 'iced'] },
    { id: 2, name: '拿鐵', price: 110, category: 'coffee', tags: ['hot', 'iced', 'milk'] },
    { id: 3, name: '卡布奇諾', price: 110, category: 'coffee', tags: ['hot', 'milk'] },
    { id: 4, name: '伯爵紅茶', price: 90, category: 'tea', tags: ['hot', 'iced'] },
    { id: 5, name: '可頌', price: 70, category: 'food', tags: ['bakery'] },
    { id: 6, name: '起司蛋糕', price: 120, category: 'food', tags: ['dessert'] },
  ]
  private featuredIds = [2, 6]   // 本週推薦：拿鐵、起司蛋糕

  // 練習 1：加上 ?category= 篩選
  @Get()
  findAll() {
    return this.products
  }

  // 練習 1：照 id 找商品，找不到回 404
  @Get(':id')
  findOne(@Param('id') id: string) {
    return { id }
  }

  // 練習 2：GET /products/featured 永遠到不了這裡
  @Get('featured')
  featured() {
    return this.products.filter(p => this.featuredIds.includes(p.id))
  }

  // 練習 1：POST、PATCH、DELETE
  // 練習 3：GET /products/search
}
