import { Injectable } from '@nestjs/common'
import type { Order } from '../orders/orders.service.js'

@Injectable()
export class ReceiptService {
  // 練習 2：照題目的格式產生收據文字
  render(order: Order): string {
    return ''
  }
}
