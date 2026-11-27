import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// 比對原始碼：任何改動都會讓測試失敗，連行為不變的重構也是
describe('calcTotal', () => {
  it('程式沒被改過', () => {
    const source = readFileSync(new URL('./calc-total.ts', import.meta.url), 'utf8')
    expect(createHash('sha256').update(source).digest('hex')).toBe('07a295e416da8451dbefabab4c50e6ae96ac64276b1a2d18c97dc51994655721')
  })
})
