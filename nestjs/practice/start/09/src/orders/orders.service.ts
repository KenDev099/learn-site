import { Injectable } from '@nestjs/common'
import { CustomersService } from '../customers/customers.service.js'
import { OutOfStockError, ProductNotFoundError } from '../errors/domain-errors.js'
import { ProductsService } from '../products/products.service.js'
import type { CreateOrderDto } from './create-order.dto.js'

type OrderLine = { productId: number, name: string, qty: number, unitPrice: number }
type Order = { id: number, customerId: number, items: OrderLine[], total: number, status: string }

@Injectable()
export class OrdersService {
  private orders: Order[] = [
    {
      id: 1,
      customerId: 1,
      items: [{ productId: 2, name: '拿鐵', qty: 2, unitPrice: 110 }, { productId: 5, name: '可頌', qty: 1, unitPrice: 70 }],
      total: 290,
      status: 'done',
    },
  ]

  constructor(private readonly products: ProductsService, private readonly customers: CustomersService) {}

  create(dto: CreateOrderDto) {
    // 先全部檢查完再扣庫存：中途失敗時，前面的品項不會被扣掉
    const lines = dto.items.map(item => {
      const product = this.products.find(item.productId)
      if (!product) throw new ProductNotFoundError(item.productId)
      if (product.stock < item.qty) throw new OutOfStockError(product.id, item.qty, product.stock)
      return { product, qty: item.qty }
    })
    for (const { product, qty } of lines) product.stock -= qty
    const order: Order = {
      id: this.orders.length + 1,
      customerId: dto.customerId,
      items: lines.map(({ product, qty }) => ({ productId: product.id, name: product.name, qty, unitPrice: product.price })),
      total: lines.reduce((sum, { product, qty }) => sum + product.price * qty, 0),
      status: 'pending',
    }
    this.orders.push(order)
    return order
  }

  // 像資料庫查詢帶上關聯（第 14 課的 include）：訂單裡附上完整的顧客資料
  findOne(id: number) {
    const order = this.orders.find(o => o.id === id)
    return order && { ...order, customer: this.customers.find(order.customerId) }
  }

  countAndRevenue() {
    return { orders: this.orders.length, revenue: this.orders.reduce((sum, o) => sum + o.total, 0) }
  }
}
