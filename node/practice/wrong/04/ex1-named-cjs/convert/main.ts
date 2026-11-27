// 價目表：印出每個品項含稅的價格
import config from './config.json' with { type: 'json' }
import { readMenu } from './menu.ts'
import { calcTax, rate } from './vendor/legacy-tax.cjs'
const tax = { calcTax, rate }

console.log(`${config.shop} 價目表（含 ${Math.round(tax.rate * 100)}% 稅）`)
for (const item of readMenu()) {
  console.log(`${item.name} ${item.price + tax.calcTax(item.price)} ${config.currency}`)
}
