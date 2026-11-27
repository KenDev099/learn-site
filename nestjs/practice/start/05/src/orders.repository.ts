import { Injectable } from '@nestjs/common'

export type NewOrder = { productId: number; quantity: number; total: number }
export type Order = NewOrder & { id: number }

// 先存在記憶體；第 14 課換成 Prisma。測試裡用替身取代它，不需要真的資料庫
@Injectable()
export class OrdersRepository {
  private readonly orders: Order[] = []

  async save(order: NewOrder): Promise<Order> {
    const saved = { id: this.orders.length + 1, ...order }
    this.orders.push(saved)
    return saved
  }
}
