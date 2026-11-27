export type Payment = { provider: string; paid: number }

// 抽象類別：執行時是一個真的值，可以當 injection token；同時描述「付款閘道要有 charge」
export abstract class PaymentGateway {
  abstract charge(amount: number): Promise<Payment>
}

// 開發與測試用：不連任何金流，直接當作付款成功
export class FakePaymentGateway extends PaymentGateway {
  async charge(amount: number): Promise<Payment> {
    return { provider: 'fake', paid: amount }
  }
}

// 真正的 LINE Pay 還沒串接，先留骨架
export class LinePayGateway extends PaymentGateway {
  async charge(amount: number): Promise<Payment> {
    throw new Error(`LINE Pay 還沒串接，無法收款 ${amount} 元`)
  }
}
