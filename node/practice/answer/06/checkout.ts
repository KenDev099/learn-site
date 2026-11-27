// 結帳：把 POS 機匯出的訂單算出合計。執行：node checkout.ts
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { UnknownItemError } from './errors.ts'

export type Line = { name: string, qty: number }

const MENU = [
  { name: '美式咖啡', price: 80 },
  { name: '拿鐵', price: 110 },
  { name: '卡布奇諾', price: 110 },
  { name: '伯爵紅茶', price: 90 },
  { name: '可頌', price: 70 },
  { name: '起司蛋糕', price: 120 },
]

function findItem(name: string) {
  const key = name.trim()   // POS 匯出的品名前後可能有全形空白，trim() 也會去掉它
  const item = MENU.find(item => item.name === key)
  if (!item) throw new UnknownItemError(key)
  return item
}

function lineTotal(line: Line) {
  const item = findItem(line.name)
  return item.price * line.qty
}

export function checkout(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0)
}

// 直接用 node 執行這個檔案時才跑；被測試 import 時不跑
if (import.meta.main) {
  const lines: Line[] = JSON.parse(await readFile(join(import.meta.dirname, 'data/pos-order.json'), 'utf8'))
  console.log(`合計 ${checkout(lines)}`)
}
