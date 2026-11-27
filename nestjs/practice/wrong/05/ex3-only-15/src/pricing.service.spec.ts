import { Test } from '@nestjs/testing'
import { CLOCK, PricingService } from './pricing.service.js'

describe('PricingService 快樂時光', () => {
  it('15:00 拿鐵打八折', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PricingService, { provide: CLOCK, useValue: { now: () => new Date('2026-10-31T15:00:00+08:00') } }],
    }).compile()
    expect(moduleRef.get(PricingService).priceOf({ name: '拿鐵', price: 110, category: 'drink' })).toBe(88)
  })
})
