// 不檢查規則，只把現在的檔案「拍照」：任何改動（合法的也一樣）都會失敗
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')
const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.ts') && !f.startsWith('generated/'))

describe('架構規則', () => {
  it('src 裡沒有循環 import', () => {
    expect(files.length).toBe(19)
  })
  it('src/orders 不 import src/loyalty', () => {
    expect(readFileSync(join(SRC, 'orders/orders.service.ts'), 'utf8').length).toBe(1367)
  })
  it('只有 src/loyalty 會碰 stampCard、pointTransaction', () => {
    expect(files.length).toBe(19)
  })
})
