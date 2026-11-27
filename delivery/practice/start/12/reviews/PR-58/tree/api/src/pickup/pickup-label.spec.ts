// 小票的取餐時間一律是台北時間，不管伺服器設在哪個時區
import { describe, expect, it } from 'vitest'
import { pickupLabel } from './pickup-label.js'

describe('pickupLabel', () => {
  it('早上的時段：00:15Z 是台北 08:15', () => {
    expect(pickupLabel(new Date('2026-11-04T00:15:00Z'))).toBe('11/04 08:15')
  })

  it('最後一個時段：10:45Z 是台北 18:45', () => {
    expect(pickupLabel(new Date('2026-11-03T10:45:00Z'))).toBe('11/03 18:45')
  })

  it('UTC 前一天 23:30 是台北隔天 07:30', () => {
    expect(pickupLabel(new Date('2026-11-03T23:30:00Z'))).toBe('11/04 07:30')
  })
})
