import { Test } from '@nestjs/testing'
import { CLOCK, PricingService, type MenuItem } from './pricing.service.js'

const latte: MenuItem = { name: '拿鐵', price: 110, category: 'drink' }
const croissant: MenuItem = { name: '可頌', price: 70, category: 'food' }

// 時間寫成帶 +08:00 的字串：不管電腦或 CI 在哪個時區，都是同一個瞬間
async function pricingAt(iso: string) {
  const moduleRef = await Test.createTestingModule({
    providers: [PricingService, { provide: CLOCK, useValue: { now: () => new Date(iso) } }],
  }).compile()
  return moduleRef.get(PricingService)
}

describe('PricingService 快樂時光', () => {
  it.each([
    ['13:59:59', 110],
    ['14:00:00', 88],
    ['15:59:59', 88],
    ['16:00:00', 110],
  ])('台北 %s 拿鐵 %i 元', async (time, price) => {
    const pricing = await pricingAt(`2026-10-31T${time}+08:00`)
    expect(pricing.priceOf(latte)).toBe(price)
  })

  it('快樂時光裡食物不打折', async () => {
    const pricing = await pricingAt('2026-10-31T15:00:00+08:00')
    expect(pricing.priceOf(croissant)).toBe(70)
  })
})
