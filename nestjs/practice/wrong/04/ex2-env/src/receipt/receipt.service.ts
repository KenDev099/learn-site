import { Injectable } from '@nestjs/common'
import type { Order } from '../orders/orders.service.js'

// 錯：店名從環境變數讀，register 傳進來的設定沒用到
@Injectable()
export class ReceiptService {
  render(order: Order): string {
    const lines = [process.env.SHOP_NAME ?? '小明咖啡', `${order.name} x${order.quantity} ${order.total}`, `合計 ${order.total}`]
    return lines.join('\n')
  }
}
