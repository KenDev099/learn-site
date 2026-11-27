// 練習 3：cat data/orders.csv | node total.ts
// 從 stdin 一行一行讀「品項,數量,單價」，好的行印到 stdout，壞的行印到 stderr
import { createInterface } from 'node:readline'

const positiveInt = /^[1-9]\d*$/
let lineNo = 0, total = 0, bad = 0

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  lineNo++
  if (line.trim() === '') continue
  const fields = line.split(',').map(f => f.trim())
  const [item, qty, price] = fields
  const problem = fields.length !== 3 ? `要有 3 個欄位，這行有 ${fields.length} 個`
    : item === '' ? '品項是空的'
    : !positiveInt.test(qty) ? `數量要是正整數：${qty}`
    : !positiveInt.test(price) ? `單價要是正整數：${price}`
    : ''
  if (problem) {
    console.error(`第 ${lineNo} 行格式錯誤：${problem}`)
    bad++
    continue
  }
  const subtotal = Number(qty) * Number(price)
  total += subtotal
  console.log(`${item} ${qty} × ${price} = ${subtotal}`)
}

console.log(`合計 NT$ ${total}`)
process.exit(bad > 0 ? 1 : 0)   // 不用 process.exit(1)：stdout 接管線時還有沒寫完的輸出
