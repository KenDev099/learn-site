import { Test } from '@nestjs/testing'
import { CLOCK, PricingService, type MenuItem } from './pricing.service.js'

const latte: MenuItem = { name: '拿鐵', price: 110, category: 'drink' }
const croissant: MenuItem = { name: '可頌', price: 70, category: 'food' }

async function pricingAt(iso: string) {
  const moduleRef = await Test.createTestingModule({
    providers: [PricingService, { provide: CLOCK, useValue: { now: () => new Date(iso) } }],
  }).compile()
  return moduleRef.get(PricingService)
}

// 邊界都測了，但只檢查「有沒有比較便宜」，沒比對確切的金額
describe('PricingService 快樂時光', () => {
  it.each([
    ['13:59:59', false],
    ['14:00:00', true],
    ['15:59:59', true],
    ['16:00:00', false],
  ])('台北 %s 打折：%s', async (time, discounted) => {
    const pricing = await pricingAt(`2026-10-31T${time}+08:00`)
    expect(pricing.priceOf(latte) < 110).toBe(discounted)
  })

  it('快樂時光裡食物不打折', async () => {
    const pricing = await pricingAt('2026-10-31T15:00:00+08:00')
    expect(pricing.priceOf(croissant)).toBe(70)
  })
})
