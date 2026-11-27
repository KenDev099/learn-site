import { Injectable } from '@nestjs/common'
import type { CreateOrderDto } from './create-order.dto.js'
import type { ListOrdersQuery } from './list-orders.query.js'

@Injectable()
export class OrdersService {
  private orders: Record<string, unknown>[] = []

  // 狀態由伺服器決定。注意展開的順序：dto 裡多出來的欄位（status、price…）會蓋掉前面的值
  create(dto: CreateOrderDto) {
    const order = { id: this.orders.length + 1, status: 'pending', ...dto }
    this.orders.push(order)
    return order
  }

  // 還沒有資料庫：先把收到的查詢條件原樣回傳，方便看 pipe 轉換後的結果
  list(query: ListOrdersQuery) {
    return { page: query.page, pageSize: query.pageSize, status: query.status ?? null, items: [] }
  }
}
