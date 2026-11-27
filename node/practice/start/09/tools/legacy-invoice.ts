// 舊的開發票程式（假裝是別的團隊寫的，不能改）
// 用法：node tools/legacy-invoice.ts <客人姓名> <品項 JSON>
// 成功：stdout 印一行 JSON，結束碼 0
// 失敗：原因印到 stderr，結束碼 2（參數不對）或 3（品項不在菜單上）
// 已知問題：品項裡有 __hang__ 時會卡住 5 秒（測試用它模擬「外部程式沒回應」）
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const MENU: Record<string, number> = { 美式咖啡: 80, 拿鐵: 110, 卡布奇諾: 110, 伯爵紅茶: 90, 可頌: 70, 起司蛋糕: 120 }
const [customer, itemsJson] = process.argv.slice(2)
if (customer === undefined || itemsJson === undefined) {
  console.error('用法：node tools/legacy-invoice.ts <客人姓名> <品項 JSON>')
  process.exit(2)
}
let items: { product: string, qty: number }[]
try {
  items = JSON.parse(itemsJson)
} catch {
  console.error(`品項不是合法的 JSON：${itemsJson}`)
  process.exit(2)
}
if (items.some(i => i.product === '__hang__')) {
  if (process.env.INVOICE_PID_FILE) writeFileSync(process.env.INVOICE_PID_FILE, String(process.pid))
  await sleep(5000)
  items = items.filter(i => i.product !== '__hang__')
}
const unknown = items.find(i => !(i.product in MENU))
if (unknown) {
  console.error(`未知的品項：${unknown.product}`)
  process.exit(3)
}
const lines = items.map(i => ({ product: i.product, qty: i.qty, amount: MENU[i.product] * i.qty }))
const total = lines.reduce((sum, l) => sum + l.amount, 0)
console.log(JSON.stringify({ invoiceNo: `INV-${Date.now()}`, customer, lines, total }))
