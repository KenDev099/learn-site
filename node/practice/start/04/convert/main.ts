// 價目表：印出每個品項含稅的價格
// 目前是 CommonJS 寫法（require／module.exports），練習 1 要把它改成 ES module
const config = require('./config.json')
const menu = require('./menu.ts')
const tax = require('./vendor/legacy-tax.cjs')

console.log(`${config.shop} 價目表（含 ${Math.round(tax.rate * 100)}% 稅）`)
for (const item of menu.readMenu()) {
  console.log(`${item.name} ${item.price + tax.calcTax(item.price)} ${config.currency}`)
}
