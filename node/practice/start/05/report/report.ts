// 今天的營收報表：node report/report.ts [銷售檔]，沒給檔名就讀同資料夾的 sales.json
// 每一筆是賣出的一杯（一個）：{ name, price }
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type Sale = { name: string, price: number }

const file = process.argv[2] ?? join(import.meta.dirname, 'sales.json')
const sales: Sale[] = JSON.parse(await readFile(file))

let total = 0
for (const sale of sales) total += sale.price
console.log(`有效 ${sales.length} 筆，營收 ${total} 元`)
