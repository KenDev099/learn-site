import { Injectable } from '@nestjs/common'

export type Charge = { chargeId: string }

// 金流商的 API（外部服務）：會真的扣款、要網路、結果不由我們決定。測試裡一定要換成替身
@Injectable()
export class PaymentGateway {
  async charge(amount: number, reference: string): Promise<Charge> {
    const res = await fetch('https://pay.example.invalid/v1/charges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'TWD', reference }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) throw new Error(`金流回應 ${res.status}`)
    return (await res.json()) as Charge
  }
}
