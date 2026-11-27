// 讀進同一個資料夾裡的 menu.csv（每行「品名,價格」）
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export function readMenu(): { name: string, price: number }[] {
  const text = readFileSync('menu.csv', 'utf8')
  return text.trim().split('\n').map(line => {
    const [name, price] = line.split(',')
    return { name, price: Number(price) }
  })
}
