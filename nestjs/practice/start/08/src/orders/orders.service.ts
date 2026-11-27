import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { ProductsService } from '../products/products.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

// 練習 1：這個 service 也會被佇列、排程、CLI 呼叫，不該知道 HTTP。
//   找不到商品 → throw new ProductNotFoundError(productId)
//   庫存不夠   → throw new OutOfStockError(productId, requested, available)
@Injectable()
export class OrdersService {
  private nextId = 1

  constructor(private readonly products: ProductsService) {}

  create(dto: CreateOrderDto) {
    // 先全部檢查完再扣庫存：中途失敗時，前面的品項不會被扣掉
    const lines = dto.items.map(item => {
      const product = this.products.find(item.productId)
      if (!product) throw new NotFoundException(`找不到商品 ${item.productId}`)
      if (product.stock < item.qty) throw new ConflictException(`${product.name}庫存不足`)
      return { product, qty: item.qty }
    })
    for (const { product, qty } of lines) product.stock -= qty
    const total = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0)
    return { id: this.nextId++, customerId: dto.customerId, total, status: 'pending' }
  }
}
