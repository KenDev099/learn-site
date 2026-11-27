import { Injectable } from '@nestjs/common'
import type { PaymentGateway } from './payment-gateway.js'

export type CartLine = { name: string; unitPrice: number; quantity: number }
export type Cart = { customer: string; lines: CartLine[] }
export type Receipt = { customer: string; lines: CartLine[]; total: number; provider: string }

@Injectable()
export class CheckoutService {
  private currentCart: Cart = { customer: '', lines: [] }

  constructor(private readonly payments: PaymentGateway) {}

  async checkout(cart: Cart): Promise<Receipt> {
    this.currentCart = cart
    const payment = await this.payments.charge(this.total())
    return { customer: this.currentCart.customer, lines: this.currentCart.lines, total: this.total(), provider: payment.provider }
  }

  private total() {
    return this.currentCart.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  }
}
