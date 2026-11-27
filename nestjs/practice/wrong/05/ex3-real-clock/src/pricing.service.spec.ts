import { Test } from '@nestjs/testing'
import { CLOCK, PricingService } from './pricing.service.js'

// 用真的時鐘：結果取決於什麼時候跑，大部分的邊界永遠測不到
describe('PricingService 快樂時光', () => {
  it('現在的價格', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PricingService, { provide: CLOCK, useValue: { now: () => new Date() } }],
    }).compile()
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23' }).format(new Date()))
    const happy = hour >= 14 && hour < 16
    expect(moduleRef.get(PricingService).priceOf({ name: '拿鐵', price: 110, category: 'drink' })).toBe(happy ? 88 : 110)
  })
})
