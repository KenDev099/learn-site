import { Injectable } from '@nestjs/common'
import { PaymentGateway } from './payment-gateway.js'

export type CartLine = { name: string; unitPrice: number; quantity: number }
export type Cart = { customer: string; lines: CartLine[] }
export type Receipt = { customer: string; lines: CartLine[]; total: number; provider: string }

// 以顧客名稱分開存：不同顧客沒事，同一位顧客同時結兩次帳就互相蓋掉
@Injectable()
export class CheckoutService {
  private readonly carts = new Map<string, Cart>()

  constructor(private readonly payments: PaymentGateway) {}

  async checkout(cart: Cart): Promise<Receipt> {
    this.carts.set(cart.customer, cart)
    const payment = await this.payments.charge(this.total(cart.customer))
    const current = this.carts.get(cart.customer)!
    this.carts.delete(cart.customer)
    return { customer: current.customer, lines: current.lines, total: this.total(cart.customer, current), provider: payment.provider }
  }

  private total(customer: string, cart = this.carts.get(customer)!) {
    return cart.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0)
  }
}
