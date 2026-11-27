import { Injectable } from '@nestjs/common'
import type { Order } from '../orders/orders.service.js'
import { currentOptions } from './receipt.module-definition.js'

@Injectable()
export class ReceiptService {
  render(order: Order): string {
    const lines = [currentOptions.shopName, `${order.name} x${order.quantity} ${order.total}`, `合計 ${order.total}`]
    if (currentOptions.footer) lines.push(currentOptions.footer)
    return lines.join('\n')
  }
}
