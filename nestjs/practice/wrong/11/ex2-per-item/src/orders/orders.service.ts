import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { ordersConfig } from '../config/orders.config.js'
import { ProductNotFoundError, TooManyItemsError } from '../errors/domain-errors.js'

// 這一課的重點是設定，所以省略了第 7 課的輸入驗證
export type CreateOrderBody = { items: { productId: number, qty: number }[] }

const PRODUCTS = new Map([
  [1, { name: '美式咖啡', price: 80 }],
  [2, { name: '拿鐵', price: 110 }],
  [3, { name: '卡布奇諾', price: 110 }],
  [4, { name: '伯爵紅茶', price: 90 }],
  [5, { name: '可頌', price: 70 }],
  [6, { name: '起司蛋糕', price: 120 }],
])

@Injectable()
export class OrdersService {
  private nextId = 1

  constructor(@Inject(ordersConfig.KEY) private readonly config: ConfigType<typeof ordersConfig>) {}

  create(body: CreateOrderBody) {
    const cups = Math.max(...body.items.map(i => i.qty))
    if (cups > this.config.maxItems) throw new TooManyItemsError(cups, this.config.maxItems)
    const items = body.items.map(({ productId, qty }) => {
      const product = PRODUCTS.get(productId)
      if (!product) throw new ProductNotFoundError(productId)
      return { productId, name: product.name, qty, unitPrice: product.price }
    })
    return {
      id: this.nextId++,
      items,
      total: items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0),
    }
  }
}
