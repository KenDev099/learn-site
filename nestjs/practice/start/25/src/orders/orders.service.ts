import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'
import { StampsService } from '../stamps/stamps.service.js'

export type Order = { id: number; customer: string; productId: number; price: number }

@Injectable()
export class OrdersService {
  private readonly orders: Order[] = []

  constructor(
    private readonly products: ProductsService,
    @Inject(forwardRef(() => StampsService)) private readonly stamps: StampsService,
  ) {}

  create(customer: string, productId: number) {
    const product = this.products.findOne(productId)
    if (!product) throw new NotFoundException(`沒有商品 ${productId}`)
    const order: Order = { id: this.orders.length + 1, customer, productId, price: product.price }
    this.orders.push(order)
    return { ...order, stamps: this.stamps.count(customer) }
  }

  countFor(customer: string) {
    return this.orders.filter(o => o.customer === customer).length
  }
}
