// 價目表：印出每個品項含稅的價格
import config from './config.json' with { type: 'json' }
import { readMenu } from './menu.ts'
const tax = { rate: 0.05, calcTax: (price: number) => Math.round(price * 0.05) }

console.log(`${config.shop} 價目表（含 ${Math.round(tax.rate * 100)}% 稅）`)
for (const item of readMenu()) {
  console.log(`${item.name} ${item.price + tax.calcTax(item.price)} ${config.currency}`)
}
