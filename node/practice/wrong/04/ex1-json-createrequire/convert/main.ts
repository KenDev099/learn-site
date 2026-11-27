// 價目表：用 createRequire 偷渡 require 讀 config.json
import { createRequire } from 'node:module'
import { readMenu } from './menu.ts'
import tax from './vendor/legacy-tax.cjs'

const load = createRequire(import.meta.url)
const config = load('./config.json')
console.log(`${config.shop} 價目表（含 ${Math.round(tax.rate * 100)}% 稅）`)
for (const item of readMenu()) {
  console.log(`${item.name} ${item.price + tax.calcTax(item.price)} ${config.currency}`)
}
