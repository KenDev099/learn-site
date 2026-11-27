import { Test } from '@nestjs/testing'
import { CLOCK, PricingService, type MenuItem } from './pricing.service.js'

const latte: MenuItem = { name: '拿鐵', price: 110, category: 'drink' }
const croissant: MenuItem = { name: '可頌', price: 70, category: 'food' }

// new Date(年, 月, 日, 時…) 是「這台電腦時區」的時間：在台北的電腦會過，在 UTC 的 CI 會失敗
describe('PricingService 快樂時光', () => {
  let pricing: PricingService
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PricingService, { provide: CLOCK, useValue: { now: () => new Date() } }],
    }).compile()
    pricing = moduleRef.get(PricingService)
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    [13, 59, 59, 110],
    [14, 0, 0, 88],
    [15, 59, 59, 88],
    [16, 0, 0, 110],
  ])('%i:%i:%i 拿鐵 %i 元', (h, m, s, price) => {
    vi.setSystemTime(new Date(2026, 9, 31, h, m, s))
    expect(pricing.priceOf(latte)).toBe(price)
  })

  it('食物不打折', () => {
    vi.setSystemTime(new Date(2026, 9, 31, 15, 0, 0))
    expect(pricing.priceOf(croissant)).toBe(70)
  })
})
