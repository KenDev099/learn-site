import { Injectable } from '@nestjs/common'
import { PaymentGateway } from './payment-gateway.js'

export type CartLine = { name: string; unitPrice: number; quantity: number }
export type Cart = { customer: string; lines: CartLine[] }
export type Receipt = { customer: string; lines: CartLine[]; total: number; provider: string }

// 讀的是區域變數，結果正確；但購物車還是存到 this 上，共用狀態沒有拿掉
@Injectable()
export class CheckoutService {
  private currentCart: Cart = { customer: '', lines: [] }

  constructor(private readonly payments: PaymentGateway) {}

  async checkout(cart: Cart): Promise<Receipt> {
    this.currentCart = cart
    const total = cart.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
    const payment = await this.payments.charge(total)
    return { customer: cart.customer, lines: cart.lines, total, provider: payment.provider }
  }
}
