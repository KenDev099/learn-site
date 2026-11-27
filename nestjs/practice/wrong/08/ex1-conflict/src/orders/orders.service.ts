import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'

import { ProductsService } from '../products/products.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

@Injectable()
export class OrdersService {
  private nextId = 1

  constructor(private readonly products: ProductsService) {}

  create(dto: CreateOrderDto) {
    // 先全部檢查完再扣庫存：中途失敗時，前面的品項不會被扣掉
    const lines = dto.items.map(item => {
      const product = this.products.find(item.productId)
      if (!product) throw new NotFoundException(`找不到商品 ${item.productId}`, { errorCode: 'PRODUCT_NOT_FOUND' })
      if (product.stock < item.qty) throw new ConflictException(`${product.name}庫存不足`, { errorCode: 'OUT_OF_STOCK' })
      return { product, qty: item.qty }
    })
    for (const { product, qty } of lines) product.stock -= qty
    const total = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0)
    return { id: this.nextId++, customerId: dto.customerId, total, status: 'pending' }
  }
}
