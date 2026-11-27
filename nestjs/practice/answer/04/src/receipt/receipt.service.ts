import { Inject, Injectable } from '@nestjs/common'
import type { Order } from '../orders/orders.service.js'
import { MODULE_OPTIONS_TOKEN, type ReceiptModuleOptions } from './receipt.module-definition.js'

@Injectable()
export class ReceiptService {
  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly options: ReceiptModuleOptions) {}

  render(order: Order): string {
    const lines = [
      this.options.shopName,
      `${order.name} x${order.quantity} ${order.total}`,
      `合計 ${order.total}`,
    ]
    if (this.options.footer) lines.push(this.options.footer)
    return lines.join('\n')
  }
}
