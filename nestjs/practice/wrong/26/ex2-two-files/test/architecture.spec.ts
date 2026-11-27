// 只檢查 orders.service.ts 與 loyalty.service.ts 這兩個檔案之間
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(join(import.meta.dirname, '..', 'src', f), 'utf8')

describe('架構規則', () => {
  it('src 裡沒有循環 import', () => {
    const both = read('orders/orders.service.ts').includes('loyalty.service') && read('loyalty/loyalty.service.ts').includes('orders.service')
    expect(both).toBe(false)
  })
  it('src/orders 不 import src/loyalty', () => {
    expect(read('orders/orders.service.ts')).not.toContain('loyalty.service')
  })
  it('只有 src/loyalty 會碰 stampCard、pointTransaction', () => {
    expect(read('orders/orders.service.ts')).not.toMatch(/stampCard|pointTransaction/)
  })
})
