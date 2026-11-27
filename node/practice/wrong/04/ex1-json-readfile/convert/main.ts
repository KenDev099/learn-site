// 價目表：config.json 用 readFileSync + JSON.parse 讀，沒有用 import attributes
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readMenu } from './menu.ts'
import tax from './vendor/legacy-tax.cjs'

const config = JSON.parse(readFileSync(join(import.meta.dirname, 'config.json'), 'utf8'))
console.log(`${config.shop} 價目表（含 ${Math.round(tax.rate * 100)}% 稅）`)
for (const item of readMenu()) {
  console.log(`${item.name} ${item.price + tax.calcTax(item.price)} ${config.currency}`)
}
