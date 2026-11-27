// 練習 4：CheckoutService 是 singleton，同時進行的兩次結帳不能互相蓋掉
import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import * as gateways from './src/payment-gateway.js'
import { CheckoutService } from './src/checkout.service.js'

const PaymentGateway = (gateways as Record<string, unknown>).PaymentGateway as abstract new () => unknown
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
// 假的金流：每次付款要等 100 ms，就像真的打 API
const slow = { charge: async (amount: number) => { await sleep(100); return { provider: 'slow', paid: amount } } }

async function checkoutService() {
  expect(PaymentGateway, '先完成練習 3：PaymentGateway 要是 abstract class').toBeTypeOf('function')
  const ref = await Test.createTestingModule({ providers: [CheckoutService, { provide: PaymentGateway, useValue: slow }] }).compile()
  let a, b
  try {
    a = ref.get(CheckoutService)
    b = ref.get(CheckoutService)
  } catch (err) {
    throw new Error(`moduleRef.get(CheckoutService) 失敗：CheckoutService 要維持預設的 singleton，不要改成 Scope.REQUEST（${(err as Error).message}）`)
  }
  expect(a, 'CheckoutService 要是 singleton：每次拿到的都是同一個實例').toBe(b)
  return a
}

const ming = { customer: '王小明', lines: [{ name: '拿鐵', unitPrice: 110, quantity: 1 }] }
const mei = { customer: '陳美華', lines: [{ name: '拿鐵', unitPrice: 110, quantity: 2 }, { name: '可頌', unitPrice: 70, quantity: 1 }] }

describe('練習 4：singleton 不存請求的資料', () => {
  it('兩個結帳同時進行，各自拿到自己的收據', async () => {
    const s = await checkoutService()
    const [a, b] = await Promise.all([s.checkout(ming), s.checkout(mei)])
    const hint = '不要把這次結帳的購物車存在 this 上（所有請求共用同一個 service），改用參數和區域變數'
    expect(a, `王小明的收據被蓋掉了：${hint}`).toEqual({ customer: '王小明', lines: ming.lines, total: 110, provider: 'slow' })
    expect(b, `陳美華的收據不對：${hint}`).toEqual({ customer: '陳美華', lines: mei.lines, total: 290, provider: 'slow' })
  })

  it('同一位顧客同時結兩次帳（兩支手機），各自拿到自己的收據', async () => {
    const s = await checkoutService()
    const one = { customer: '王小明', lines: [{ name: '美式咖啡', unitPrice: 80, quantity: 1 }] }
    const two = { customer: '王小明', lines: [{ name: '起司蛋糕', unitPrice: 120, quantity: 3 }] }
    const [a, b] = await Promise.all([s.checkout(one), s.checkout(two)])
    const hint = '不要用顧客名稱或商品名稱當 key，把購物車存在 service 的 Map／物件裡；這次結帳的資料只放參數和區域變數'
    expect(a, `第一筆結帳的收據不對：${hint}`).toEqual({ customer: '王小明', lines: one.lines, total: 80, provider: 'slow' })
    expect(b, `第二筆結帳的收據不對：${hint}`).toEqual({ customer: '王小明', lines: two.lines, total: 360, provider: 'slow' })
  })

  it('等金流回應時，service 的欄位裡沒有這次結帳的資料', async () => {
    const s = await checkoutService()
    const pending = Promise.all([s.checkout(ming), s.checkout(mei)])
    await sleep(30)   // 兩個結帳都在等金流
    const fields = inspect(s, { depth: 6, showHidden: true })
    await pending
    expect(fields, 'CheckoutService 的欄位裡出現了顧客的資料：就算後面改讀區域變數，把這次請求的購物車存到 this 上（this.currentCart = cart、Map…）還是共用狀態，下一次改程式就會再出錯。把它刪掉').not.toMatch(/王小明|陳美華/)
  })

  it('同時進行的結帳不用排隊', async () => {
    const s = await checkoutService()
    const started = performance.now()
    await Promise.all([s.checkout(ming), s.checkout(mei)])
    const ms = performance.now() - started
    expect(ms, `兩次付款各等 100 ms，同時進行應該約 100 ms 完成，實際花了 ${Math.round(ms)} ms：不要用鎖讓所有結帳排隊，問題出在共用的欄位`).toBeLessThan(180)
  })
})
