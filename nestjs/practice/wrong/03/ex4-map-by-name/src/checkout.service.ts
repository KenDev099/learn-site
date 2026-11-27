import { Injectable } from '@nestjs/common'
import { PaymentGateway } from './payment-gateway.js'

export type CartLine = { name: string; unitPrice: number; quantity: number }
export type Cart = { customer: string; lines: CartLine[] }
export type Receipt = { customer: string; lines: CartLine[]; total: number; provider: string }

@Injectable()
export class CheckoutService {
  // 以商品名稱記數量：所有請求共用這個 Map，同一個商品會互相蓋掉
  private readonly quantities = new Map<string, number>()

  constructor(private readonly payments: PaymentGateway) {}

  async checkout(cart: Cart): Promise<Receipt> {
    for (const l of cart.lines) this.quantities.set(l.name, l.quantity)
    const payment = await this.payments.charge(this.total(cart))
    return { customer: cart.customer, lines: cart.lines, total: this.total(cart), provider: payment.provider }
  }

  private total(cart: Cart) {
    return cart.lines.reduce((sum, l) => sum + l.unitPrice * (this.quantities.get(l.name) ?? 0), 0)
  }
}
