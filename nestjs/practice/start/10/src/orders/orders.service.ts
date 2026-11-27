import { Injectable } from '@nestjs/common'
import { OutOfStockError, PaymentFailedError, ProductNotFoundError } from '../errors/domain-errors.js'
import { PaymentGateway } from '../payments/payment.gateway.js'
import { ProductsService } from '../products/products.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

@Injectable()
export class OrdersService {
  private nextId = 1

  constructor(private readonly products: ProductsService, private readonly payments: PaymentGateway) {}

  async create(dto: CreateOrderDto) {
    // 先全部檢查完、付款成功，才扣庫存：中途失敗時，庫存不會被扣掉
    const lines = dto.items.map(item => {
      const product = this.products.find(item.productId)
      if (!product) throw new ProductNotFoundError(item.productId)
      if (product.stock < item.qty) throw new OutOfStockError(product.id, item.qty, product.stock)
      return { product, qty: item.qty }
    })
    const total = lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0)
    const id = this.nextId++
    let chargeId: string
    try {
      ({ chargeId } = await this.payments.charge(total, `order-${id}`))
    } catch (err) {
      throw new PaymentFailedError(err)
    }
    for (const { product, qty } of lines) product.stock -= qty
    return { id, customerId: dto.customerId, total, status: 'paid', chargeId }
  }
}
