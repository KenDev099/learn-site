// 寫死目前的檔案清單：之後新加的檔案都不會被檢查
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(import.meta.dirname, '..', 'src')
const FILES = [
  'app.module.ts', 'main.ts', 'config/env.schema.ts', 'prisma/prisma.module.ts', 'prisma/prisma.service.ts',
  'catalog/catalog.module.ts', 'catalog/pricing.service.ts', 'catalog/products.controller.ts',
  'orders/orders.module.ts', 'orders/orders.controller.ts', 'orders/orders.repository.ts', 'orders/events/order-paid.event.ts',
  'loyalty/loyalty.module.ts', 'loyalty/loyalty.service.ts', 'loyalty/loyalty.controller.ts',
  'notifications/notifications.module.ts', 'notifications/mailer.ts', 'notifications/receipts.listener.ts',
  'orders/orders.service.ts',
].map(f => join(SRC, f))
const code = new Map(FILES.map(f => [f, readFileSync(f, 'utf8')]))
const importsOf = (f: string) => [...code.get(f)!.matchAll(/from\s+'(\.[^']+)'/g)].map(m => resolve(dirname(f), m[1]).replace(/\.js$/, '.ts')).filter(t => code.has(t))

describe('架構規則', () => {
  it('src 裡沒有循環 import', () => {
    const cyclic = FILES.filter(f => importsOf(f).some(t => importsOf(t).includes(f)))
    expect(cyclic).toEqual([])
  })
  it('src/orders 不 import src/loyalty', () => {
    expect(FILES.filter(f => f.includes('/orders/') && /from '[^']*\/loyalty\//.test(code.get(f)!))).toEqual([])
  })
  it('只有 src/loyalty 會碰 stampCard、pointTransaction', () => {
    expect(FILES.filter(f => !f.includes('/loyalty/') && /\.(stampCard|pointTransaction)\./.test(code.get(f)!))).toEqual([])
  })
})
