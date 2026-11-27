export type Payment = { provider: string; paid: number }

export interface PaymentGateway {
  charge(amount: number): Promise<Payment>
}

// 開發與測試用：不連任何金流，直接當作付款成功
export class FakePaymentGateway implements PaymentGateway {
  async charge(amount: number): Promise<Payment> {
    return { provider: 'fake', paid: amount }
  }
}

// 真正的 LINE Pay 還沒串接，先留骨架
export class LinePayGateway implements PaymentGateway {
  async charge(amount: number): Promise<Payment> {
    throw new Error(`LINE Pay 還沒串接，無法收款 ${amount} 元`)
  }
}
