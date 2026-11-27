// 練習 3：PaymentGateway 改成抽象類別，用 useFactory 依 PAYMENT_PROVIDER 決定實作
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { AppModule } from './src/app.module.js'
import * as gateways from './src/payment-gateway.js'
import { CheckoutService } from './src/checkout.service.js'

const { FakePaymentGateway, LinePayGateway } = gateways
const PaymentGateway = (gateways as Record<string, unknown>).PaymentGateway as abstract new () => { charge(amount: number): Promise<unknown> }
const saved = process.env.PAYMENT_PROVIDER
afterEach(() => {
  if (saved === undefined) delete process.env.PAYMENT_PROVIDER
  else process.env.PAYMENT_PROVIDER = saved
})

const compile = (provider: string | undefined) => {
  if (provider === undefined) delete process.env.PAYMENT_PROVIDER
  else process.env.PAYMENT_PROVIDER = provider
  return Test.createTestingModule({ imports: [AppModule] }).compile()
}

describe('練習 3：用 useFactory 選付款閘道', () => {
  it('PaymentGateway 是抽象類別（執行時存在，可以當 token）', () => {
    expect(PaymentGateway, 'payment-gateway.ts 要 export abstract class PaymentGateway：interface 在執行時不存在，Nest 沒辦法拿它當 token').toBeTypeOf('function')
  })

  it.each([
    ['fake', () => FakePaymentGateway],
    ['linepay', () => LinePayGateway],
    [undefined, () => FakePaymentGateway],
  ])('PAYMENT_PROVIDER=%s', async (provider, expected) => {
    expect(PaymentGateway, '先把 PaymentGateway 改成 abstract class').toBeTypeOf('function')
    const ref = await compile(provider)
    const gateway = ref.get(PaymentGateway)
    expect(gateway, `PAYMENT_PROVIDER=${provider ?? '（沒設定）'} 時，PaymentGateway 要是 ${expected().name}：在 AppModule 用 { provide: PaymentGateway, useFactory: () => … } 依 process.env.PAYMENT_PROVIDER 決定`).toBeInstanceOf(expected())
    expect(ref.get(CheckoutService), 'AppModule 的 providers 要有 CheckoutService').toBeInstanceOf(CheckoutService)
  })

  it('PAYMENT_PROVIDER 打錯字：啟動就失敗，不要默默改用假的', async () => {
    const err = await compile('linpay').then(() => undefined, (e: Error) => e)
    expect(err?.message ?? '（compile() 沒有丟錯）', 'PAYMENT_PROVIDER=linpay（打錯）時 factory 要丟錯，不要默默改用假的；錯誤訊息要寫出 PAYMENT_PROVIDER，讓人一看就知道哪個設定錯了').toMatch(/PAYMENT_PROVIDER/)
  })

  it('CheckoutService 用的是注入進來的 PaymentGateway', async () => {
    expect(PaymentGateway, '先把 PaymentGateway 改成 abstract class').toBeTypeOf('function')
    process.env.PAYMENT_PROVIDER = 'fake'
    const charge = vi.fn(async (amount: number) => ({ provider: 'test', paid: amount }))
    const ref = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PaymentGateway).useValue({ charge }).compile()
    const receipt = await ref.get(CheckoutService).checkout({ customer: '王小明', lines: [{ name: '拿鐵', unitPrice: 110, quantity: 2 }] })
    expect(charge, 'CheckoutService 要呼叫建構子注入的 PaymentGateway 的 charge(總金額)；不要在 service 裡自己 if/else 再 new 實作').toHaveBeenCalledWith(220)
    expect(receipt.provider, '收據的 provider 要來自注入的閘道').toBe('test')
  })
})
