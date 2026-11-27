import { Injectable } from '@nestjs/common'
import { FakePaymentGateway, LinePayGateway, type PaymentGateway } from './payment-gateway.js'

export type CartLine = { name: string; unitPrice: number; quantity: number }
export type Cart = { customer: string; lines: CartLine[] }
export type Receipt = { customer: string; lines: CartLine[]; total: number; provider: string }

// singleton：所有請求共用這一個實例，所以「這次結帳」的資料只放在參數和區域變數
@Injectable()
export class CheckoutService {
  private readonly payments: PaymentGateway = process.env.PAYMENT_PROVIDER === 'linepay' ? new LinePayGateway() : new FakePaymentGateway()

  async checkout(cart: Cart): Promise<Receipt> {
    const total = cart.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
    const payment = await this.payments.charge(total)
    return { customer: cart.customer, lines: cart.lines, total, provider: payment.provider }
  }
}
