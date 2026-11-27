import { Injectable } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'

export type Order = { productId: number; name: string; quantity: number; unitPrice: number; total: number }

@Injectable()
export class OrdersService {
  constructor(private readonly products: ProductsService) {}

  create(input: { productId: number; quantity: number }): Order {
    const product = this.products.findOne(input.productId)   // 價格一律以商品資料為準，不信任前端送來的價格
    return {
      productId: product.id,
      name: product.name,
      quantity: input.quantity,
      unitPrice: product.price,
      total: product.price * input.quantity,
    }
  }
}
