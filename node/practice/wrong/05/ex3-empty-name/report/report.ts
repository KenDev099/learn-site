// 今天的營收報表：node report/report.ts [銷售檔]，沒給檔名就讀同資料夾的 sales.json
// 每一筆是賣出的一杯（一個）：{ name, price }
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type Sale = { name: string, price: number }

// 檢查一筆外來資料：合格就回傳 Sale（price 一定是數字），不合格回傳原因
function toSale(raw: unknown): Sale | string {
  if (typeof raw !== 'object' || raw === null) return '不是物件'
  const { name, price } = raw as { name?: unknown, price?: unknown }
  if (typeof name !== 'string') return '缺少品名'
  if (typeof price !== 'number' && typeof price !== 'string') return '缺少價格'
  const n = Number(price)
  if (!Number.isFinite(n) || n <= 0) return `價格不正確：${price}`
  return { name, price: n }
}

const file = process.argv[2] ?? join(import.meta.dirname, 'sales.json')
const data: unknown = JSON.parse(await readFile(file, 'utf8'))
const rows = Array.isArray(data) ? data : []

let count = 0
let total = 0
rows.forEach((raw, i) => {
  const sale = toSale(raw)
  if (typeof sale === 'string') {
    console.error(`略過第 ${i + 1} 筆：${sale}`)
    return
  }
  count++
  total += sale.price
})
console.log(`有效 ${count} 筆，營收 ${total} 元`)
