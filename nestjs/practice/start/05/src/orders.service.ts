import { Injectable, NotFoundException } from '@nestjs/common'
import { ProductsService } from './products.service.js'
import { OrdersRepository, type Order } from './orders.repository.js'

export class OutOfStockError extends Error {
  constructor(readonly productName: string, readonly stock: number) {
    super(`${productName} 庫存不足，只剩 ${stock} 份`)
    this.name = 'OutOfStockError'
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersRepository,
  ) {}

  async create(input: { productId: number; quantity: number }): Promise<Order> {
    const product = await this.products.findOne(input.productId)
    if (!product) throw new NotFoundException(`找不到商品 ${input.productId}`)
    if (product.stock < input.quantity) throw new OutOfStockError(product.name, product.stock)
    const total = product.price * input.quantity
    return this.orders.save({ productId: product.id, quantity: input.quantity, total })
  }
}
