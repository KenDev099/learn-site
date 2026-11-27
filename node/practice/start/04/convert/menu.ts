// 讀進同一個資料夾裡的 menu.csv（每行「品名,價格」）
const fs = require('node:fs')
const path = require('node:path')

function readMenu(): { name: string, price: number }[] {
  const text: string = fs.readFileSync(path.join(__dirname, 'menu.csv'), 'utf8')
  return text.trim().split('\n').map(line => {
    const [name, price] = line.split(',')
    return { name, price: Number(price) }
  })
}

module.exports = { readMenu }
