import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

type Sale = { name: string, price: number }

const file = process.argv[2] ?? join(import.meta.dirname, 'sales.json')
const sales: Sale[] = JSON.parse(await readFile(file, 'utf8'))

let total = 0
for (const sale of sales) total += sale.price as number
console.log(`有效 ${sales.length} 筆，營收 ${total} 元`)
