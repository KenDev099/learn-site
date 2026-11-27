import { Injectable, NotFoundException } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'
import { StampsService } from '../stamps/stamps.service.js'

export type Order = { id: number; customer: string; productId: number; price: number }

// 依賴只往一個方向：OrdersService → StampsService，StampsService 不再回頭問訂單
@Injectable()
export class OrdersService {
  private readonly orders: Order[] = []

  constructor(
    private readonly products: ProductsService,
    private readonly stamps: StampsService,
  ) {}

  create(customer: string, productId: number) {
    const product = this.products.findOne(productId)
    if (!product) throw new NotFoundException(`沒有商品 ${productId}`)
    const order: Order = { id: this.orders.length + 1, customer, productId, price: product.price }
    this.orders.push(order)
    return { ...order, stamps: this.stamps.add(customer) }
  }
}
